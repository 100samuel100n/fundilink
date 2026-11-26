'use client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Audit() {
  const l = useAsync(() => api.admin.auditLogs(200));
  return <><PageTitle title="Audit logs" sub="Append-only. The database rejects edits and deletes." /><Async state={l}>{(rows) => <DataTable rows={rows} cols={[{ h: 'When', cell: (r) => dt(r.at) }, { h: 'Actor', cell: (r) => <>{r.actor_role}<div className="muted small">{String(r.actor_id ?? '').slice(0, 8)}</div></> }, { h: 'Action', cell: (r) => <code>{r.action}</code> }, { h: 'Target', cell: (r) => `${r.target_kind} ${String(r.target_id).slice(0, 8)}` }, { h: 'Change', cell: (r) => <code className="small">{JSON.stringify(r.previous_value)} → {JSON.stringify(r.new_value)}</code> }, { h: 'Reason', cell: (r) => r.reason ?? '—' }]} />}</Async></>;
}
