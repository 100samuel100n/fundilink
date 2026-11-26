'use client';
import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { kes, type CompareRow } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Empty, Stars } from './ui';
import { Icon } from './Icon';

type Row = { label: string; cell: (r: CompareRow) => React.ReactNode; best?: (rows: CompareRow[]) => string | null; show?: (rows: CompareRow[]) => boolean };
type Group = { title: string; rows: Row[] };

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const pct = (v: unknown) => { const n = num(v); return n == null ? '—' : `${Math.round(n <= 1 ? n * 100 : n)}%`; };
const bestMax = (f: (r: CompareRow) => number | null) => (rows: CompareRow[]) => { const v = rows.map((r) => ({ id: r.id, n: f(r) })).filter((x) => x.n != null) as { id: string; n: number }[]; if (v.length < 2) return null; const m = Math.max(...v.map((x) => x.n)); return v.filter((x) => x.n === m).length === v.length ? null : v.find((x) => x.n === m)!.id; };
const bestMin = (f: (r: CompareRow) => number | null) => (rows: CompareRow[]) => { const v = rows.map((r) => ({ id: r.id, n: f(r) })).filter((x) => x.n != null && x.n > 0) as { id: string; n: number }[]; if (v.length < 2) return null; const m = Math.min(...v.map((x) => x.n)); return v.filter((x) => x.n === m).length === v.length ? null : v.find((x) => x.n === m)!.id; };
const has = (k: keyof CompareRow) => (rows: CompareRow[]) => rows.some((r) => r[k] != null && r[k] !== '');
const yes = (b: boolean) => (b ? <span className="row-ic"><Icon name="check" size={15} stroke={2.5} />Yes</span> : <span className="muted">No</span>);

// Price is shown but never highlighted as "best": customers should weigh trust and fit, not only cost.
const GROUPS: Group[] = [
  { title: 'Trust', rows: [
    { label: 'Identity verified', cell: (r) => yes(!!r.verification?.includes('identity')) },
    { label: 'Business verified', cell: (r) => yes(!!r.verification?.includes('business')) },
    { label: 'Qualification verified', cell: (r) => yes(!!r.verification?.includes('qualification')) },
    { label: 'Qualifications', cell: (r) => r.qualifications?.length ? r.qualifications.join(', ') : '—' },
  ] },
  { title: 'Reputation', rows: [
    { label: 'Rating', cell: (r) => (r.rating_count > 0 ? <Stars value={Number(r.rating_avg)} count={r.rating_count} /> : <span className="muted">No reviews yet</span>), best: bestMax((r) => (r.rating_count > 0 ? Number(r.rating_avg) : null)) },
    { label: 'Completed jobs', cell: (r) => r.completed_jobs, best: bestMax((r) => r.completed_jobs) },
    { label: 'Experience', cell: (r) => (r.years_experience != null ? `${r.years_experience} yrs` : '—'), best: bestMax((r) => r.years_experience) },
    { label: 'Response time', cell: (r) => (r.avg_response_minutes != null ? `${r.avg_response_minutes} min` : '—'), best: bestMin((r) => r.avg_response_minutes) },
    { label: 'Completion rate', cell: (r) => pct(r.completion_rate), show: has('completion_rate') },
    { label: 'Cancellation rate', cell: (r) => pct(r.cancellation_rate), show: has('cancellation_rate') },
    { label: 'Repeat customers', cell: (r) => pct(r.repeat_customer_rate), show: has('repeat_customer_rate') },
    { label: 'Portfolio items', cell: (r) => r.portfolio_count ?? '—', show: has('portfolio_count') },
  ] },
  { title: 'Price and terms', rows: [
    { label: 'Starting price', cell: (r) => (r.starting_price ? kes(r.starting_price) : 'Quotation') },
    { label: 'Travels up to', cell: (r) => `${Number(r.max_travel_km)} km` },
    { label: 'Free travel within', cell: (r) => (r.free_radius_km != null ? `${Number(r.free_radius_km)} km` : '—'), show: has('free_radius_km') },
    { label: 'Charge per km beyond', cell: (r) => (r.per_km ? kes(r.per_km) : '—'), show: has('per_km') },
    { label: 'Minimum call-out', cell: (r) => (r.min_call_out ? kes(r.min_call_out) : '—'), show: has('min_call_out') },
    { label: 'Workmanship warranty', cell: (r) => (r.warranty_days ? `${r.warranty_days} days` : '—'), show: has('warranty_days') },
    { label: 'Urgent jobs', cell: (r) => yes(r.accepts_emergency) },
  ] },
];

export function CompareClient() {
  const ids = (useSearchParams().get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
  const st = useAsync(() => (ids.length ? api.compare(ids) : Promise.resolve([])), [ids.join(',')]);
  return (
    <Async state={st}>{(rows) => !rows.length ? <Empty title="Nothing to compare" body="Tick “Compare” on up to four professionals." action={<Link className="btn" href="/explore">Browse professionals</Link>} /> : (
      <>
        <div className="tablewrap"><table className="cmp">
          <thead><tr><th></th>{rows.map((r) => <th key={r.id} scope="col"><Link href={`/professionals/${r.slug}`} style={{ fontSize: '1rem', color: 'var(--ink)', textTransform: 'none', letterSpacing: 0 }}>{r.name}</Link></th>)}</tr></thead>
          <tbody>
            {GROUPS.map((g) => {
              const vis = g.rows.filter((x) => !x.show || x.show(rows));
              return (
                <React.Fragment key={g.title}>
                  <tr className="group"><th colSpan={rows.length + 1}>{g.title}</th></tr>
                  {vis.map((x) => { const best = x.best?.(rows) ?? null; return (
                    <tr key={x.label}><th scope="row">{x.label}</th>{rows.map((r) => <td key={r.id} className={best === r.id ? 'best' : undefined}>{x.cell(r)}</td>)}</tr>
                  ); })}
                </React.Fragment>
              );
            })}
            <tr><th scope="row"></th>{rows.map((r) => <td key={r.id}><div className="row wrap-r" style={{ gap: 8 }}><Link className="btn sm" href={`/app/book/${r.slug}`}>Book</Link><Link className="btn sm ghost" href={`/professionals/${r.slug}`}>Profile</Link></div></td>)}</tr>
          </tbody>
        </table></div>
        <p className="muted small" style={{ marginTop: 12 }}>A tick marks the strongest value in a row. Price is never marked as best: compare trust, reputation and terms together.</p>
      </>
    )}</Async>
  );
}
