'use client';
import React, { useState } from 'react';
import { kes, timeAgo, type PaymentIntent } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Card, Skeleton } from './ui';
import { MpesaSheet } from './payments';

const KIND: Record<string, string> = { wallet_topup: 'Top-up', direct_commission: 'Commission', wallet_adjustment: 'Adjustment' };
const QUICK = [20000, 50000, 100000, 200000, 500000];

/** Prepaid wallet for pay-on-site jobs (Model 2): top up with M-Pesa, commission is deducted when the customer confirms a job. */
export function WalletView() {
  const t = useToast();
  const w = useAsync(() => api.wallet());
  const me = useAsync(() => api.myProfile());
  const [amount, setAmount] = useState(100000);
  const [custom, setCustom] = useState('');
  const [open, setOpen] = useState(false);
  const minor = custom ? Math.round(Number(custom) * 100) : amount;

  return (
    <Async state={w} skeleton={<Skeleton h={160} n={2} />}>{(d) => {
      const bal = Number(d.balance);
      const tone = bal <= d.minBalance ? 'bad' : d.low ? 'warn' : 'good';
      const valid = minor >= d.minTopup && minor <= d.maxTopup && minor % 100 === 0;
      return (
        <div className="stack" style={{ gap: 20 }}>
          <div className={`walletcard ${tone}`}>
            <div className="wc-top"><span className="wc-label">Wallet balance</span><Badge tone={tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : 'danger'}>{tone === 'good' ? 'Taking pay-on-site jobs' : tone === 'warn' ? 'Running low' : 'Top up to continue'}</Badge></div>
            <div className="wc-amount">{kes(bal)}</div>
            <p className="wc-note">{bal <= d.minBalance ? 'Customers cannot choose pay-on-site with you until you top up. In-app paid jobs are unaffected.' : 'Platform commission on pay-on-site jobs is taken from this balance when the customer confirms the job. In-app paid jobs are paid out to you directly and never touch it.'}</p>
            <button className="btn wc-btn" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Top up with M-Pesa'}</button>
          </div>

          {open ? (
            <Card>
              <h3>Choose an amount</h3>
              <div className="chips" style={{ marginBottom: 12 }}>
                {QUICK.map((q) => <button key={q} className={`chip ${!custom && amount === q ? 'on' : ''}`} onClick={() => { setAmount(q); setCustom(''); }}>{kes(q)}</button>)}
              </div>
              <div className="field"><label htmlFor="wc">Or enter an amount (KSh)</label><input id="wc" inputMode="numeric" placeholder={`${d.minTopup / 100} to ${(d.maxTopup / 100).toLocaleString('en-KE')}`} value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} /></div>
              {valid ? <MpesaSheet key={minor} compact amount={minor} title={`Top up ${kes(minor)}`} cta={`Top up ${kes(minor)}`} note="Credited the moment M-Pesa confirms. Wallet money is for platform commission; it is not withdrawable."
                start={(phone, key) => api.walletTopup({ amount: minor, phone, idempotencyKey: key })} onDone={() => { t.ok('Wallet topped up'); setOpen(false); setCustom(''); w.reload(); }} /> : <p className="small muted">Enter between {kes(d.minTopup)} and {kes(d.maxTopup)}, in whole shillings.</p>}
            </Card>
          ) : null}

          <Card>
            <h3>How you get paid</h3>
            <p className="small muted">Offer customers one or both. You can change this any time.</p>
            <Async state={me} skeleton={<Skeleton h={60} />}>{(p) => <Modes escrow={p.accepts_escrow_payment !== false} direct={p.accepts_direct_payment !== false} onSaved={() => { me.refresh(); w.refresh(); }} />}</Async>
          </Card>

          <Card>
            <h3>Wallet activity</h3>
            {d.topups.some((x: PaymentIntent) => x.status === 'pending') ? <p className="banner" role="status">A top-up is waiting for your M-Pesa PIN.</p> : null}
            {!d.transactions.length ? <p className="muted">No activity yet. Top-ups and commission charges will appear here.</p> : (
              <div className="tablewrap"><table><thead><tr><th>When</th><th>What</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>
                {d.transactions.map((x) => <tr key={x.id}><td>{timeAgo(x.created_at)}</td><td>{KIND[x.kind] ?? x.kind}{x.reference ? <span className="muted small"> · {x.reference}</span> : null}</td><td style={{ textAlign: 'right', fontWeight: 700, color: Number(x.amount) < 0 ? 'var(--bad-fg)' : 'var(--good-fg)' }} className="money">{Number(x.amount) > 0 ? '+' : ''}{kes(x.amount)}</td></tr>)}
              </tbody></table></div>
            )}
          </Card>
        </div>
      );
    }}</Async>
  );
}

function Modes({ escrow, direct, onSaved }: { escrow: boolean; direct: boolean; onSaved: () => void }) {
  const t = useToast();
  const [v, setV] = useState({ escrow, direct });
  const save = async (n: { escrow: boolean; direct: boolean }) => {
    if (!n.escrow && !n.direct) return t.err('Offer at least one way to be paid');
    setV(n);
    try { await api.setPaymentModes(n); t.ok('Saved'); onSaved(); } catch (e) { setV(v); t.err(errMsg(e)); }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="check"><input type="checkbox" checked={v.escrow} onChange={(e) => save({ ...v, escrow: e.target.checked })} /><span><b>In-app payment (protected)</b><br /><span className="small muted">Customer pays upfront, we hold it, you are paid to your M-Pesa after the job is confirmed.</span></span></label>
      <label className="check"><input type="checkbox" checked={v.direct} onChange={(e) => save({ ...v, direct: e.target.checked })} /><span><b>Pay on site (cash or M-Pesa)</b><br /><span className="small muted">You collect from the customer; commission comes from your wallet.</span></span></label>
    </div>
  );
}
