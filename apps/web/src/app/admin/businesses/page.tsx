'use client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Badge, Card } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';
import { ListPage } from '@/components/ListPage';

export default function Businesses() {
  const orgs = useAsync(() => api.adminX.organizations());
  return (
    <div className="stack" style={{ gap: 28 }}>
      <ListPage title="Service companies" sub="Registered professional businesses with teams." load={() => api.adminX.businesses()}
        cols={() => [{ h: 'Business', cell: (b) => b.business_name ?? b.display_name }, { h: 'County', cell: (b) => b.county ?? '—' }, { h: 'Team', cell: (b) => b.team_size },
          { h: 'Business verification', cell: (b) => (b.business_verification ?? []).map((s: string) => <Badge key={s} tone={s === 'approved' ? 'success' : 'neutral'}>{s}</Badge>) }, { h: 'Status', cell: (b) => b.status }]} />
      <Card><h3>Enterprise organisations</h3><Async state={orgs}>{(rows) => <DataTable rows={rows} empty="No organisations yet" cols={[{ h: 'Name', cell: (o) => o.name }, { h: 'Type', cell: (o) => o.kind }, { h: 'Properties', cell: (o) => o.properties }, { h: 'Members', cell: (o) => o.members }, { h: 'Created', cell: (o) => dt(o.created_at) }]} />}</Async></Card>
    </div>
  );
}
