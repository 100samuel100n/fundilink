'use client';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Badge, Button, Stars } from '@/components/ui';
import { ListPage } from '@/components/ListPage';

export default function Pros() {
  const t = useToast();
  return <ListPage title="Professionals" sub="Verification badges are separate: identity, qualification and business." load={() => api.adminX.professionals()}
    cols={(reload) => [
      { h: 'Name', cell: (p) => <a href={`/professionals/${p.slug}`}>{p.display_name}</a> }, { h: 'Type', cell: (p) => p.account_type }, { h: 'County', cell: (p) => p.county ?? '—' },
      { h: 'Rating', cell: (p) => <Stars value={Number(p.rating_avg)} count={p.rating_count} /> }, { h: 'Completed', cell: (p) => p.completed },
      { h: 'Badges', cell: (p) => (p.verified_levels ?? []).map((l: string) => <Badge key={l} tone="success">{l}</Badge>) },
      { h: 'Status', cell: (p) => <Badge tone={p.status === 'active' ? 'success' : p.status === 'suspended' ? 'danger' : 'neutral'}>{p.status}</Badge> },
      { h: '', cell: (p) => p.status !== 'suspended' ? <Button small tone="danger" onClick={async () => { const reason = prompt('Reason for suspension (kept in the audit log)?'); if (!reason) return; try { await api.admin.suspendProfessional(p.id, { reason }); t.ok('Suspended'); reload(); } catch (e) { t.err(errMsg(e)); } }}>Suspend</Button> : null },
    ]} />;
}
