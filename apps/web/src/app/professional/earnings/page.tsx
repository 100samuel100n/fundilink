'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, Chip, Money, PageTitle, Select, Skeleton, Stat, TextField } from '@/components/ui';

export default function Earnings() {
  const e = useAsync(() => api.earnings());
  return (
    <><PageTitle title="Earnings & payouts" sub="Money from in-app jobs is held in escrow, then paid to your M-Pesa after the customer confirms." />
      <Async state={e} skeleton={<Skeleton h={90} />}>{(d) => (
        <>
          <div className="grid g4">
            <Stat n={<Money minor={d.inEscrow ?? 0} />} l="In escrow (jobs in progress)" />
            <Stat n={<Money minor={d.pendingSettlement} />} l="Payout on its way" />
            <Stat n={<Money minor={d.settled} />} l="Paid out to you" />
            <Stat n={<Money minor={d.directThisMonth ?? 0} />} l={`Collected on site this month (${d.directJobsThisMonth ?? 0} jobs)`} />
          </div>
          {d.wallet ? <Card style={{ marginTop: 16 }} className="row between wrap-r"><div><b>Wallet {d.wallet.low ? '· running low' : ''}</b><div className="muted small">Pays commission on pay-on-site jobs.</div></div><div className="row"><span className="money-lg"><Money minor={d.wallet.balance} /></span><Link className="btn secondary" href="/professional/wallet">Manage wallet</Link></div></Card> : null}
        </>
      )}</Async>
      <PayoutAccount />
      <Card style={{ marginTop: 20 }}><p className="small muted" style={{ margin: 0 }}>Balances come from an immutable ledger. Payouts are sent to your M-Pesa automatically when a job settles. Changing payout details triggers a security alert.</p></Card>
    </>
  );
}

function PayoutAccount() {
  const t = useToast();
  const me = useAsync(() => api.myProfile());
  const [f, setF] = useState({ kind: 'mobile_money' as 'mobile_money' | 'bank', provider: 'M-Pesa', accountRef: '', accountName: '' });
  const [busy, setBusy] = useState(false);
  const ok = f.accountRef.replace(/\s/g, '').length >= 6 && f.accountName.trim().length >= 2 && f.provider.trim();
  const save = async () => {
    setBusy(true);
    try { await api.setPayoutAccount({ ...f, accountRef: f.accountRef.replace(/\s/g, ''), accountName: f.accountName.trim() }); t.ok('Payout account saved'); setF({ ...f, accountRef: '' }); me.refresh(); } catch (er) { t.err(errMsg(er)); }
    setBusy(false);
  };
  return (
    <Card style={{ marginTop: 20 }}>
      <h3>Payout account</h3>
      <p className="small muted">Where we send your earnings. M-Pesa payouts are automatic; bank payouts are processed by our finance team.</p>
      <div className="chips" style={{ marginBottom: 12 }}><Chip label="M-Pesa" on={f.kind === 'mobile_money'} onClick={() => setF({ ...f, kind: 'mobile_money', provider: 'M-Pesa' })} /><Chip label="Bank" on={f.kind === 'bank'} onClick={() => setF({ ...f, kind: 'bank', provider: '' })} /></div>
      {f.kind === 'bank' ? <TextField label="Bank name" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /> : null}
      <TextField label={f.kind === 'bank' ? 'Account number' : 'M-Pesa phone number'} inputMode="tel" placeholder={f.kind === 'bank' ? '' : '0712 345 678'} value={f.accountRef} onChange={(e) => setF({ ...f, accountRef: e.target.value })} />
      <TextField label="Account holder name" hint="Must match your verified identity." value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} />
      <Button loading={busy} disabled={!ok} onClick={save}>Save payout account</Button>
    </Card>
  );
}
