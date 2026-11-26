'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Transactions() {
  const tx = useAsync(() => api.admin.transactions());
  const bal = useAsync(() => api.admin.balances());
  return (
    <><PageTitle title="Transactions & ledger" sub="Double-entry, append-only. Balances are derived, never edited." />
      <h2>Account balances</h2>
      <Async state={bal}>{(rows) => <DataTable rows={rows.map((r, i) => ({ ...r, id: i }))} cols={[{ h: 'Account', cell: (r) => <code>{r.account}</code> }, { h: 'Debits', cell: (r) => kes(r.debits) }, { h: 'Credits', cell: (r) => kes(r.credits) }, { h: 'Credit balance', cell: (r) => <strong>{kes(r.credit_balance)}</strong> }]} />}</Async>
      <h2 style={{ marginTop: 28 }}>Latest ledger transactions</h2>
      <Async state={tx}>{(rows) => <DataTable rows={rows} cols={[{ h: '#', cell: (r) => r.id }, { h: 'Kind', cell: (r) => r.kind }, { h: 'When', cell: (r) => dt(r.created_at) }, { h: 'Entries', cell: (r) => <div className="small">{(r.entries ?? []).map((e: any, i: number) => <div key={i}><code>{e.account}</code> {Number(e.debit) ? `Dr ${kes(e.debit)}` : `Cr ${kes(e.credit)}`}</div>)}</div> }]} />}</Async>
    </>
  );
}
export { Card };
