/**
 * Immutable double-entry ledger. Balances are DERIVED from entries, never edited.
 * Corrections are made by posting reversing transactions.
 *
 * Chart of accounts
 *   PSP_HOLDING                 asset      funds held by the licensed payment partner
 *   PRO_PAYABLE:<id>            liability  owed to a professional
 *   PLATFORM_REVENUE            revenue    commission + customer fees
 *   TAX_PAYABLE                 liability  tax collected on platform fees
 *   PSP_FEES_EXPENSE            expense    payment processing costs
 */
export interface Entry {
  account: string;
  debit: number;
  credit: number;
}

export interface LedgerTx {
  id: string;
  idempotencyKey: string;
  kind: string;
  bookingId?: string;
  entries: Entry[];
  createdAt: Date;
}

export class LedgerError extends Error {}

export const PSP = 'PSP_HOLDING';
export const REVENUE = 'PLATFORM_REVENUE';
export const TAX = 'TAX_PAYABLE';
export const PSP_FEES = 'PSP_FEES_EXPENSE';
export const proPayable = (proId: string) => `PRO_PAYABLE:${proId}`;

export class Ledger {
  private txs: LedgerTx[] = [];
  private byKey = new Map<string, LedgerTx>();

  /** Idempotent: re-posting the same key returns the original transaction. */
  post(input: { idempotencyKey: string; kind: string; bookingId?: string; entries: Entry[] }): LedgerTx {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;

    const entries = input.entries.filter((e) => e.debit !== 0 || e.credit !== 0);
    for (const e of entries) {
      if (!Number.isInteger(e.debit) || !Number.isInteger(e.credit) || e.debit < 0 || e.credit < 0) {
        throw new LedgerError('Entries must be non-negative integers');
      }
      if (e.debit > 0 && e.credit > 0) throw new LedgerError('An entry is either a debit or a credit');
    }
    const d = entries.reduce((s, e) => s + e.debit, 0);
    const c = entries.reduce((s, e) => s + e.credit, 0);
    if (entries.length < 2 || d !== c) throw new LedgerError(`Unbalanced transaction: debits ${d} != credits ${c}`);

    const tx: LedgerTx = Object.freeze({
      id: `tx_${this.txs.length + 1}`,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      bookingId: input.bookingId,
      entries: Object.freeze(entries.map((e) => Object.freeze({ ...e }))) as unknown as Entry[],
      createdAt: new Date(),
    });
    this.txs.push(tx);
    this.byKey.set(tx.idempotencyKey, tx);
    return tx;
  }

  /** Debit-normal accounts (assets/expenses) report debit-credit; others credit-debit. */
  balance(account: string): number {
    let d = 0, c = 0;
    for (const t of this.txs) for (const e of t.entries) if (e.account === account) { d += e.debit; c += e.credit; }
    const debitNormal = account === PSP || account === PSP_FEES;
    return debitNormal ? d - c : c - d;
  }

  isBalanced(): boolean {
    let d = 0, c = 0;
    for (const t of this.txs) for (const e of t.entries) { d += e.debit; c += e.credit; }
    return d === c;
  }

  all(): readonly LedgerTx[] { return this.txs; }
}

/* ---------- Posting recipes ---------- */
export interface PaymentSplit {
  gross: number;        // what the customer paid
  proNet: number;       // owed to professional
  platformRevenue: number;
  tax: number;
}

export function paymentReceived(l: Ledger, a: { paymentId: string; bookingId: string; proId: string; split: PaymentSplit }) {
  const { gross, proNet, platformRevenue, tax } = a.split;
  if (proNet + platformRevenue + tax !== gross) throw new LedgerError('Split does not add up to gross');
  return l.post({
    idempotencyKey: `payment:${a.paymentId}`,
    kind: 'payment_received',
    bookingId: a.bookingId,
    entries: [
      { account: PSP, debit: gross, credit: 0 },
      { account: proPayable(a.proId), debit: 0, credit: proNet },
      { account: REVENUE, debit: 0, credit: platformRevenue },
      { account: TAX, debit: 0, credit: tax },
    ],
  });
}

export function processingFee(l: Ledger, a: { paymentId: string; bookingId: string; fee: number }) {
  return l.post({
    idempotencyKey: `psp-fee:${a.paymentId}`,
    kind: 'psp_fee',
    bookingId: a.bookingId,
    entries: [
      { account: PSP_FEES, debit: a.fee, credit: 0 },
      { account: PSP, debit: 0, credit: a.fee },
    ],
  });
}

export function payout(l: Ledger, a: { payoutId: string; proId: string; amount: number; bookingId?: string }) {
  if (l.balance(proPayable(a.proId)) < a.amount) throw new LedgerError('Payout exceeds professional balance');
  return l.post({
    idempotencyKey: `payout:${a.payoutId}`,
    kind: 'payout',
    bookingId: a.bookingId,
    entries: [
      { account: proPayable(a.proId), debit: a.amount, credit: 0 },
      { account: PSP, debit: 0, credit: a.amount },
    ],
  });
}

/** Refund `amount` to the customer, reversing the original split proportionally. */
export function refund(
  l: Ledger,
  a: { refundId: string; bookingId: string; proId: string; amount: number; original: PaymentSplit },
) {
  const { gross, platformRevenue, tax } = a.original;
  if (a.amount <= 0 || a.amount > gross) throw new LedgerError('Invalid refund amount');
  const revShare = Math.round((a.amount * platformRevenue) / gross);
  const taxShare = Math.round((a.amount * tax) / gross);
  const proShare = a.amount - revShare - taxShare;
  return l.post({
    idempotencyKey: `refund:${a.refundId}`,
    kind: 'refund',
    bookingId: a.bookingId,
    entries: [
      { account: proPayable(a.proId), debit: proShare, credit: 0 },
      { account: REVENUE, debit: revShare, credit: 0 },
      { account: TAX, debit: taxShare, credit: 0 },
      { account: PSP, debit: 0, credit: a.amount },
    ],
  });
}

/** Reconcile internal PSP balance against the provider's statement. */
export function reconcile(l: Ledger, providerBalance: number) {
  const internal = l.balance(PSP);
  return { internal, provider: providerBalance, difference: providerBalance - internal, matches: internal === providerBalance };
}
