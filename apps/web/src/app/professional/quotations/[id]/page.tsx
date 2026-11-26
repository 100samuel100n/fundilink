'use client';
import React, { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { kes, type LineInput } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Card, PageTitle, TextArea, TextField } from '@/components/ui';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const t = useToast(); const router = useRouter();
  const [scope, setScope] = useState(''); const [excl, setExcl] = useState(''); const [days, setDays] = useState('7'); const [valid, setValid] = useState('14');
  const [items, setItems] = useState<{ label: string; kind: LineInput['kind']; quantity: string; amount: string }[]>([{ label: 'Labour', kind: 'labour', quantity: '1', amount: '' }]);
  const [ms, setMs] = useState([{ title: 'Start', pct: '30', criteria: 'Work commences on site' }, { title: 'Substantial completion', pct: '60', criteria: 'Main work finished' }, { title: 'Final acceptance', pct: '10', criteria: 'Customer accepts' }]);
  const [req, setReq] = useState(''); const [busy, setBusy] = useState(false);
  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.amount) * 100, 0);
  const pctSum = ms.reduce((s, m) => s + Number(m.pct), 0);
  const draft = async () => { try { const r = await api.quoteDraft(req, 'tradesperson'); setScope(r.draft?.scope ?? scope); t.ok('Draft inserted. Review every figure before sending.'); } catch (e) { t.err(errMsg(e)); } };
  const send = async () => {
    setBusy(true);
    try { await api.submitQuote(id, { scope, exclusions: excl || undefined, durationDays: Number(days), validDays: Number(valid), items: items.map((i) => ({ label: i.label, kind: i.kind, quantity: Number(i.quantity), unitAmount: Math.round(Number(i.amount) * 100) })), milestones: ms.map((m) => ({ title: m.title, percentBps: Math.round(Number(m.pct) * 100), criteria: m.criteria })) }); t.ok('Quotation sent'); router.push('/professional/quotations'); }
    catch (e) { t.err(errMsg(e)); setBusy(false); }
  };
  return (
    <div className="narrow"><PageTitle title="Prepare quotation" />
      <Card><TextArea label="Customer requirements (for AI draft)" value={req} onChange={(e) => setReq(e.target.value)} /><Button tone="secondary" small disabled={req.length < 10} onClick={draft}>✨ Draft scope with AI</Button><p className="small muted">AI drafts are suggestions. You are responsible for the final figures.</p></Card>
      <Card style={{ marginTop: 16 }}>
        <TextArea label="Scope of work" value={scope} onChange={(e) => setScope(e.target.value)} />
        <TextField label="Exclusions" value={excl} onChange={(e) => setExcl(e.target.value)} />
        <div className="grid g2"><TextField label="Duration (days)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /><TextField label="Valid for (days)" inputMode="numeric" value={valid} onChange={(e) => setValid(e.target.value)} /></div>
        <h3>Costs</h3>
        {items.map((it, i) => <div className="grid g4" key={i}><TextField label="Item" value={it.label} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} /><div className="field"><label>Type</label><select value={it.kind} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, kind: e.target.value as any } : x)))}>{['labour', 'materials', 'transport', 'other'].map((k) => <option key={k}>{k}</option>)}</select></div><TextField label="Qty" inputMode="decimal" value={it.quantity} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} /><TextField label="Unit (KSh)" inputMode="decimal" value={it.amount} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} /></div>)}
        <Button tone="ghost" small onClick={() => setItems([...items, { label: '', kind: 'materials', quantity: '1', amount: '' }])}>+ Add line</Button>
        <p><strong>Subtotal: {kes(total)}</strong> <span className="muted small">(platform fee is added for the customer)</span></p>
        <h3>Payment milestones</h3>
        {ms.map((m, i) => <div className="grid g3" key={i}><TextField label="Title" value={m.title} onChange={(e) => setMs(ms.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} /><TextField label="%" inputMode="decimal" value={m.pct} onChange={(e) => setMs(ms.map((x, k) => (k === i ? { ...x, pct: e.target.value } : x)))} /><TextField label="Completion criteria" value={m.criteria} onChange={(e) => setMs(ms.map((x, k) => (k === i ? { ...x, criteria: e.target.value } : x)))} /></div>)}
        <p className={pctSum === 100 ? 'muted small' : 'small'} style={pctSum === 100 ? undefined : { color: 'var(--bad-fg)' }}>Milestones total {pctSum}% (must be 100%).</p>
        <Button loading={busy} disabled={scope.length < 10 || total <= 0 || pctSum !== 100 || items.some((i) => !i.label)} onClick={send}>Send quotation</Button></Card></div>
  );
}
