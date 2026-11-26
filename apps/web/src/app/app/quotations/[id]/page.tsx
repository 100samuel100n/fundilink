'use client';
import React, { use, useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Empty, Money, Skeleton, Stars, TextField } from '@/components/ui';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useToast();
  const proj = useAsync(() => api.project(id), [id]);
  const quotes = useAsync(() => api.projectQuotes(id).catch(() => []), [id]);
  const [note, setNote] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); t.ok(ok); proj.refresh(); quotes.refresh(); } catch (e) { t.err(errMsg(e)); } };
  return (
    <div className="stack" style={{ gap: 20 }}>
      <Async state={proj} skeleton={<Skeleton h={100} />}>{(p) => (
        <>
          <Card><div className="row between wrap-r"><h1 style={{ fontSize: '1.5rem', margin: 0 }}>{p.title}</h1><Badge>{p.status?.replace(/_/g, ' ')}</Badge></div><p>{p.scope}</p><p className="muted small">{p.address}{p.budget ? ` · Budget ${kes(p.budget)}` : ''}</p></Card>
          {p.milestones?.length ? (
            <Card><h3>Milestones</h3><div className="tablewrap"><table><thead><tr><th>Milestone</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{p.milestones.map((m: any) => (
              <tr key={m.id}><td><strong>{m.title}</strong><div className="muted small">{m.criteria}</div></td><td><Money minor={m.amount} /></td><td><Badge tone={m.status === 'approved' || m.status === 'paid' ? 'good' : m.status === 'submitted' ? 'warn' : 'neutral'}>{m.status}</Badge></td>
                <td>{m.status === 'submitted' ? <Button small onClick={() => run(() => api.approveMilestone(m.id), 'Milestone approved and released')}>Approve</Button> : null}</td></tr>))}</tbody></table></div>
              <p className="small muted" style={{ marginBottom: 0 }}>If you do nothing after a milestone is submitted, it is auto-approved after the review window, so funds are never locked indefinitely.</p></Card>
          ) : null}
        </>
      )}</Async>
      <section><h2>Quotations</h2>
        <Async state={quotes}>{(l: any[]) => {
          const sub = l.filter((q) => q.total);
          return !sub.length ? <Empty title="Waiting for quotations" body="Professionals have been notified. You will get an alert as quotes arrive." /> : (
            <div className="grid g2">{sub.map((q) => (
              <Card key={q.id}><div className="row between"><h3 style={{ margin: 0 }}>{q.display_name}</h3><strong>{kes(q.total)}</strong></div><Stars value={Number(q.rating_avg)} count={q.rating_count} />
                <p className="small muted">{q.completed_jobs} jobs · {q.duration_days} days · valid until {q.valid_until}</p><p>{q.scope}</p>{q.exclusions ? <p className="small muted">Excludes: {q.exclusions}</p> : null}
                <div className="small">{(q.items ?? []).map((i: any, k: number) => <div className="row between" key={k}><span>{i.label}</span><span>{kes(Number(i.quantity) * Number(i.unit))}</span></div>)}</div>
                <TextField label="Ask for a revision" value={note[q.id] ?? ''} onChange={(e) => setNote({ ...note, [q.id]: e.target.value })} />
                <div className="row"><Button onClick={() => run(() => api.acceptQuote(q.id), 'Quotation accepted')}>Accept</Button><Button tone="secondary" disabled={(note[q.id] ?? '').length < 3} onClick={() => run(() => api.requestQuoteRevision(q.id, note[q.id]), 'Revision requested')}>Request revision</Button></div></Card>
            ))}</div>);
        }}</Async></section>
    </div>
  );
}
