'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, PageTitle, Skeleton, Stat } from '@/components/ui';

export default function Analytics() {
  const a = useAsync(() => api.proAnalytics());
  return (
    <><PageTitle title="Performance" sub="Profile views, search appearances, conversion, retention and reliability." />
      <Async state={a} skeleton={<Skeleton h={90} n={3} />}>{(d: any) => (
        <div className="grid g4">{Object.entries(d).map(([k, v]) => <Stat key={k} n={/value|earn|amount/i.test(k) ? kes(Number(v)) : /rate|pct|percent/i.test(k) ? `${v}%` : String(v ?? '—')} l={k.replace(/_/g, ' ')} />)}</div>)}</Async>
      <Card style={{ marginTop: 16 }}><p className="muted small">Ranking balances quality, reliability, location, availability and price. A paid plan or activation fee never changes your ranking.</p></Card></>
  );
}
