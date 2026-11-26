'use client';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button } from '@/components/ui';
import { dt } from '@/components/DataTable';
import { ListPage } from '@/components/ListPage';
export default function Reports() {
  const t = useToast();
  return <ListPage title="User reports" sub="Reports about users, professionals, reviews, bookings and messages." load={() => api.adminX.reports()} empty="No open reports"
    cols={(reload) => [{ h: 'Reporter', cell: (r) => r.reporter }, { h: 'About', cell: (r) => r.target_kind }, { h: 'Reason', cell: (r) => r.reason }, { h: 'When', cell: (r) => dt(r.created_at) },
      { h: '', cell: (r) => <Button small onClick={async () => { const note = prompt('Resolution note?'); if (!note) return; try { await api.adminX.resolveReport(r.id, note); t.ok('Resolved'); reload(); } catch (e) { t.err(errMsg(e)); } }}>Resolve</Button> }]} />;
}
