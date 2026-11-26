'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Loyalty() {
  const t = useToast(); const l = useAsync(() => api.loyalty());
  return (
    <><PageTitle title="Rewards" sub="1 point per KSh 100 on completed jobs. 100 points = KSh 50 off. Referral rewards arrive after your friend's first completed job." />
      <Async state={l}>{(d) => (<div className="stack" style={{ gap: 20 }}>
        <div className="grid g2"><Card><div className="muted small">Points</div><div style={{ fontSize: '2rem', fontWeight: 800 }}>{d.points}</div>
          <Button disabled={d.points < 100} onClick={async () => { try { const r = await api.redeemPoints(Math.floor(d.points / 100) * 100); t.ok(`Code ${r.code} worth ${kes(r.value)}. Use it at checkout.`); l.reload(); } catch (e) { t.err(errMsg(e)); } }}>Redeem {Math.floor(d.points / 100) * 100} points</Button></Card>
          <Card><div className="muted small">Your referral code</div><div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{d.referralCode ?? '—'}</div></Card></div>
        <DataTable rows={d.entries.map((e: any, i: number) => ({ ...e, id: i }))} empty="No activity yet" cols={[{ h: 'When', cell: (e) => dt(e.created_at) }, { h: 'Reason', cell: (e) => String(e.reason).split(':')[0].replace(/_/g, ' ') }, { h: 'Points', cell: (e) => (e.points > 0 ? `+${e.points}` : e.points) }]} /></div>)}</Async></>
  );
}
