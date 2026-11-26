'use client';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Card, PageTitle } from '@/components/ui';

export default function Exports() {
  const t = useToast();
  const go = async (kind: 'bookings' | 'transactions' | 'customers') => {
    try {
      const text = await api.adminX.exportCsv(kind);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `fundilink-${kind}.csv`; a.click(); URL.revokeObjectURL(url);
      t.ok('Exported (logged in the audit trail)');
    } catch (e) { t.err(errMsg(e)); }
  };
  return (
    <><PageTitle title="Data exports" sub="Every export is recorded in the audit log with who, what and when. Customer data needs a specific permission." />
      <div className="grid g3">{(['bookings', 'transactions', 'customers'] as const).map((k) => <Card key={k}><h3 style={{ textTransform: 'capitalize' }}>{k}</h3><Button tone="secondary" onClick={() => go(k)}>Download CSV</Button></Card>)}</div></>
  );
}
