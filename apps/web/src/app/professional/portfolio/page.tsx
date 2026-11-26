'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, Empty, PageTitle, TextArea, TextField } from '@/components/ui';

export default function Portfolio() {
  const t = useToast(); const p = useAsync(() => api.portfolio());
  const [f, setF] = useState({ title: '', description: '' }); const before = useRef<HTMLInputElement>(null); const after = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const put = async (file?: File | null) => file ? api.uploadFile('portfolio', file, file.type) : null;
  return (
    <><PageTitle title="Portfolio" sub="Before-and-after photos and finished projects are what customers trust most. Compressed on upload." />
      <Card style={{ maxWidth: 560, marginBottom: 20 }}><h3>Add a project</h3>
        <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><TextArea label="What you did" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <label className="small">Before photo <input ref={before} type="file" accept="image/*" /></label><label className="small">After photo <input ref={after} type="file" accept="image/*,video/*" /></label>
        <Button loading={busy} disabled={f.title.length < 2} onClick={async () => { setBusy(true); try { const b = await put(before.current?.files?.[0]); const a = await put(after.current?.files?.[0]); const media = [b && { key: b, role: 'before' as const }, a && { key: a, role: 'after' as const }].filter(Boolean) as any[]; if (!media.length) throw new Error('Add at least one photo'); await api.addPortfolio({ title: f.title, description: f.description || undefined, media }); t.ok('Added'); setF({ title: '', description: '' }); p.reload(); } catch (e) { t.err(errMsg(e)); } setBusy(false); }}>Add to portfolio</Button></Card>
      <Async state={p}>{(rows) => rows.length ? <div className="grid g3">{rows.map((r: any) => <Card key={r.id}><h3>{r.title}</h3><p className="muted small">{r.description}</p><Button small tone="danger" onClick={async () => { await api.removePortfolio(r.id); p.reload(); }}>Remove</Button></Card>)}</div> : <Empty title="No projects yet" body="Add your best finished jobs." />}</Async></>
  );
}
