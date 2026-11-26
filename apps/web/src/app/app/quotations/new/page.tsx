'use client';
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { errMsg, getPosition, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Card, PageTitle, Select, TextArea, TextField } from '@/components/ui';

function Form() {
  const router = useRouter(); const t = useToast(); const sp = useSearchParams();
  const cats = useAsync(() => api.categories());
  const [f, setF] = useState({ title: '', scope: '', address: '', budget: '', categoryId: '' });
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const preset = sp.get('category');
  const catId = f.categoryId || String(cats.data?.find((c) => c.slug === preset)?.id ?? cats.data?.[0]?.id ?? '');
  const submit = async () => {
    setBusy(true);
    try {
      for (const file of files.slice(0, 6)) await api.uploadFile('problem', file, file.type || 'image/jpeg').catch(() => {});
      const r: any = await api.createProject({ title: f.title, scope: f.scope, address: f.address, lat: pt!.lat, lng: pt!.lng, budget: f.budget ? Math.round(Number(f.budget) * 100) : undefined, categoryId: Number(catId) });
      t.ok(`Sent to ${r.invited ?? 'nearby'} professionals`); router.push(`/app/quotations/${r.project?.id ?? ''}`);
    } catch (e) { t.err(errMsg(e)); setBusy(false); }
  };
  return (
    <div className="narrow"><PageTitle title="Request quotations" sub="Nearby professionals in this category will send you quotes." />
      <Card>
        <TextField label="Project title" placeholder="Paint a 3-bedroom house" value={f.title} onChange={set('title')} />
        <Select label="Category" value={catId} onChange={set('categoryId')} options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <TextArea label="Describe the work" hint="Size, condition, materials, deadlines." value={f.scope} onChange={set('scope')} />
        <TextField label="Site address" value={f.address} onChange={set('address')} />
        <div className="row wrap-r"><Button tone="secondary" onClick={async () => { try { setPt(await getPosition()); } catch (e) { t.err(errMsg(e)); } }}>Pin site location</Button><span className="muted small">{pt ? `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}` : 'Required'}</span></div>
        <TextField label="Budget in KSh (optional)" inputMode="decimal" value={f.budget} onChange={set('budget')} />
        <div className="field"><label htmlFor="pf">Photos or documents (optional)</label><input id="pf" type="file" multiple accept="image/*,video/*,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></div>
        <Button loading={busy} disabled={f.title.length < 3 || f.scope.length < 10 || !f.address || !pt || !catId} onClick={submit}>Send request</Button>
      </Card></div>
  );
}
export default function Page() { return <Suspense><Form /></Suspense>; }
