'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/components/Org';
import { Async, Card, PageTitle, Skeleton } from '@/components/ui';

export default function Overview() {
  const org = useOrg()!;
  const s = useAsync(() => api.orgSpend(org.id), [org.id]);
  const money = (k: string) => /amount|total|spend|cost|value|net|fee|commission/i.test(k);
  return (
    <><PageTitle title={org.name} sub="Spend and maintenance activity" />
      <Async state={s} skeleton={<Skeleton h={100} />}>{(d: any) => {
        const rows = Array.isArray(d) ? d : [d];
        return <div className="stack">{rows.map((r, i) => <Card key={i}><div className="grid g4">{Object.entries(r).filter(([, v]) => typeof v !== 'object').map(([k, v]) => <div key={k}><div className="muted small">{k.replace(/_/g, ' ')}</div><strong>{money(k) && !isNaN(Number(v)) ? kes(v as any) : String(v)}</strong></div>)}</div></Card>)}</div>;
      }}</Async>
      <p className="small muted" style={{ marginTop: 16 }}>Invoices and statement downloads for your organisation will appear here once the API exposes them.</p></>
  );
}
