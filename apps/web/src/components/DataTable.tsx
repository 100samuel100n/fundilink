'use client';
import React from 'react';
import { Empty } from './ui';

export interface Col<R> { h: string; cell: (r: R) => React.ReactNode }
export function DataTable<R extends { id?: string | number }>({ rows, cols, empty = 'Nothing here' }: { rows: R[]; cols: Col<R>[]; empty?: string }) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div className="tablewrap card flat" style={{ padding: 0 }}>
      <table><thead><tr>{cols.map((c) => <th key={c.h}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.id ?? i}>{cols.map((c) => <td key={c.h}>{c.cell(r)}</td>)}</tr>)}</tbody></table>
    </div>
  );
}
export const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
