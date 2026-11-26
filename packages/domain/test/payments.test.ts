import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMsisdn, maskMsisdn, toShillings, roundUpToShilling, mpesaTimestamp, parseMpesaTimestamp, parseStkCallback, describeStkFailure,
  parseDarajaResult, walletGate, directCommission, addonSplit, validateAddon, validateTopup, transition, InvalidTransitionError,
  Ledger, walletAccount, PSP, REVENUE, proPayable,
} from '../src/index.ts';

test('phone numbers normalise to the Daraja format', () => {
  for (const x of ['0712345678', '+254712345678', '254712345678', '712345678', '0712 345 678', '+254-712-345-678', '0112345678', '254112345678'])
    assert.match(normalizeMsisdn(x)!, /^254[71]\d{8}$/, x);
  assert.equal(normalizeMsisdn('0712345678'), '254712345678');
  assert.equal(normalizeMsisdn('0112345678'), '254112345678');
  for (const bad of ['', null, undefined, '071234567', '07123456789', '+255712345678', 'abc', '0212345678', '2547123456']) assert.equal(normalizeMsisdn(bad as any), null, String(bad));
  assert.equal(maskMsisdn('0712345678'), '+2547 *** *** 678');
});

test('amounts always round UP to whole shillings and never below 1', () => {
  assert.equal(toShillings(250_000), 2500);
  assert.equal(toShillings(250_001), 2501);
  assert.equal(toShillings(99), 1);
  assert.equal(toShillings(0), 1);
  assert.equal(roundUpToShilling(250_050), 250_100);
});

test('Daraja timestamps are East Africa Time and round-trip', () => {
  assert.equal(mpesaTimestamp(new Date('2026-03-05T22:30:15Z')), '20260306013015');
  assert.equal(parseMpesaTimestamp('20260306013015')!.toISOString(), '2026-03-05T22:30:15.000Z');
  assert.equal(parseMpesaTimestamp('nope'), null);
});

const okCb = (extra: any = {}) => ({ Body: { stkCallback: { MerchantRequestID: 'm1', CheckoutRequestID: 'ws_CO_1', ResultCode: 0, ResultDesc: 'ok',
  CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1500 }, { Name: 'MpesaReceiptNumber', Value: 'RCK7XYZ123' }, { Name: 'TransactionDate', Value: 20260306013015 }, { Name: 'PhoneNumber', Value: 254712345678 }] }, ...extra } } });

test('STK success and failure callbacks parse', () => {
  const r = parseStkCallback(okCb());
  assert.deepEqual([r.success, r.amountKes, r.receipt, r.phone], [true, 1500, 'RCK7XYZ123', '254712345678']);
  const f = parseStkCallback({ Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'c', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } });
  assert.equal(f.success, false);
  assert.match(describeStkFailure(f.resultCode), /cancelled/);
  assert.match(describeStkFailure(1), /balance/);
  assert.match(describeStkFailure(2001), /PIN/);
  assert.throws(() => parseStkCallback({}), /Not an STK/);
  // a "success" without receipt is rejected, never trusted
  assert.throws(() => parseStkCallback({ Body: { stkCallback: { CheckoutRequestID: 'c', ResultCode: 0, CallbackMetadata: { Item: [] } } } }), /missing/);
});

test('B2C / reversal results parse', () => {
  const r = parseDarajaResult({ Result: { ResultType: 0, ResultCode: 0, ResultDesc: 'ok', OriginatorConversationID: 'o1', ConversationID: 'c1', TransactionID: 'T1',
    ResultParameters: { ResultParameter: [{ Key: 'TransactionAmount', Value: 4500 }, { Key: 'ReceiverPartyPublicName', Value: '254712345678 - JUMA' }] } } });
  assert.deepEqual([r.success, r.transactionId, r.amountKes, r.originatorConversationId], [true, 'T1', 4500, 'o1']);
  assert.equal(parseDarajaResult({ Result: { ResultCode: 2001, ResultDesc: 'bad', OriginatorConversationID: 'o2' } }).success, false);
  assert.throws(() => parseDarajaResult({}));
});

test('wallet gate protects both the customer and the professional', () => {
  assert.equal(walletGate(50_000, 25_000, 0).ok, true);
  const g = walletGate(10_000, 25_000, 5_000);
  assert.equal(g.ok, false);
  assert.equal(g.shortfall, 20_000);
  assert.equal(walletGate(30_000, 25_000, 5_000).ok, true);
});

test('direct jobs carry commission only, no customer fee', () => {
  assert.equal(directCommission(500_000, 1000), 50_000);
});

test('add-on split uses the frozen commission and balances', () => {
  // KSh 2,000 valve at 10% commission
  const s = addonSplit([{ label: 'Replacement valve', kind: 'materials', quantity: 1, unitAmount: 200_000 }], 1000);
  assert.deepEqual([s.gross, s.net, s.commission, s.revenue], [200_000, 180_000, 20_000, 20_000]);
  assert.equal(s.net + s.revenue + s.tax, s.gross);
});

test('add-on guard rails', () => {
  const l = (n: number) => [{ label: 'x', kind: 'materials' as const, quantity: 1, unitAmount: n }];
  assert.throws(() => validateAddon([], { bookingSubtotal: 100_000 }));
  assert.throws(() => validateAddon(l(500), { bookingSubtotal: 100_000 }), /too small/);
  assert.throws(() => validateAddon(l(5_000_000), { bookingSubtotal: 100_000 }), /quotation/);
  assert.equal(validateAddon(l(200_000), { bookingSubtotal: 300_000 }), 200_000);
});

test('top-up limits', () => {
  const lim = { min: 10_000, max: 25_000_000 };
  validateTopup(50_000, lim);
  assert.throws(() => validateTopup(5_000, lim), /minimum/);
  assert.throws(() => validateTopup(30_000_000, lim), /maximum/);
  assert.throws(() => validateTopup(50_050, lim), /whole shillings/);
});

test('pay-on-site bookings skip online payment, escrow bookings cannot', () => {
  assert.throws(() => transition('pending_payment', 'awaiting_acceptance', 'system'), InvalidTransitionError);
  assert.equal(transition('pending_payment', 'awaiting_acceptance', 'system', { payOnSite: true }).to, 'awaiting_acceptance');
  assert.throws(() => transition('pending_payment', 'awaiting_acceptance', 'customer', { payOnSite: true }), InvalidTransitionError); // only the system may do it
});

test('end to end ledger: wallet top-up, direct commission, escrow add-on, payout', () => {
  const l = new Ledger();
  const pro = 'p1';
  // top up KSh 1,000 via M-Pesa
  l.post({ idempotencyKey: 'topup:1', kind: 'wallet_topup', entries: [{ account: PSP, debit: 100_000, credit: 0 }, { account: walletAccount(pro), debit: 0, credit: 100_000 }] });
  // direct job KSh 5,000 at 10% => commission 500 from wallet to revenue
  const c = directCommission(500_000, 1000);
  l.post({ idempotencyKey: 'direct:1', kind: 'direct_commission', entries: [{ account: walletAccount(pro), debit: c, credit: 0 }, { account: REVENUE, debit: 0, credit: c }] });
  assert.equal(l.balance(walletAccount(pro)), 50_000);
  assert.equal(l.balance(REVENUE), 50_000);
  // escrow add-on paid
  const s = addonSplit([{ label: 'valve', kind: 'materials', quantity: 1, unitAmount: 200_000 }], 1000);
  l.post({ idempotencyKey: 'addon:1', kind: 'addon_payment', entries: [{ account: PSP, debit: s.gross, credit: 0 }, { account: proPayable(pro), debit: 0, credit: s.net }, { account: REVENUE, debit: 0, credit: s.revenue }] });
  assert.equal(l.balance(proPayable(pro)), 180_000);
  assert.equal(l.isBalanced(), true);
});
