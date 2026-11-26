'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Check, PageTitle, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

export default function Catalogue() {
  const t = useToast(); const s = useAsync(() => api.adminX.catalogue());
  const [c, setC] = useState({ slug: '', name: '', licence: false, body: '', risk: '1', emergency: false });
  const [v, setV] = useState({ categoryId: '', slug: '', name: '', keywords: '' });
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); t.ok(ok); s.reload(); } catch (e) { t.err(errMsg(e)); } };
  return (
    <><PageTitle title="Categories & services" sub="New professions are data, not code. Licensed categories drive stricter verification." />
      <div className="grid g2" style={{ marginBottom: 20 }}>
        <Card><h3>Add category</h3>
          <TextField label="Slug (a-z, 0-9, -)" value={c.slug} onChange={(e) => setC({ ...c, slug: e.target.value })} /><TextField label="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <Check label="Requires a professional licence" checked={c.licence} onChange={(e) => setC({ ...c, licence: e.target.checked })} />
          {c.licence && <TextField label="Licensing body" value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} />}
          <TextField label="Risk level (1 low – 3 high)" inputMode="numeric" value={c.risk} onChange={(e) => setC({ ...c, risk: e.target.value })} /><Check label="Emergency capable" checked={c.emergency} onChange={(e) => setC({ ...c, emergency: e.target.checked })} />
          <Button disabled={!c.slug || !c.name} onClick={() => run(() => api.adminX.addCategory({ slug: c.slug, name: c.name, requiresLicense: c.licence, licenseBody: c.body || undefined, riskLevel: Number(c.risk) || 1, emergencyCapable: c.emergency }), 'Category added')}>Add category</Button></Card>
        <Card><h3>Add service</h3>
          <TextField label="Category ID" inputMode="numeric" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })} /><TextField label="Slug" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} /><TextField label="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <TextField label="Search keywords (comma separated, e.g. leaking pipe, burst tap)" value={v.keywords} onChange={(e) => setV({ ...v, keywords: e.target.value })} />
          <Button disabled={!v.categoryId || !v.slug || !v.name} onClick={() => run(() => api.adminX.addService({ categoryId: Number(v.categoryId), slug: v.slug, name: v.name, keywords: v.keywords.split(',').map((x) => x.trim()).filter(Boolean) }), 'Service added')}>Add service</Button></Card>
      </div>
      <Async state={s}>{(d) => <DataTable rows={d.categories} cols={[{ h: 'ID', cell: (x) => x.id }, { h: 'Category', cell: (x) => x.name }, { h: 'Licence', cell: (x) => (x.requires_license ? <Badge tone="warning">{x.license_body ?? 'required'}</Badge> : '—') }, { h: 'Risk', cell: (x) => x.risk_level }, { h: 'Live', cell: (x) => <Badge tone={x.active ? 'success' : 'neutral'}>{x.active ? 'Yes' : 'Hidden'}</Badge> },
        { h: '', cell: (x) => <Button small tone="secondary" onClick={() => run(() => api.adminX.editCategory(x.id, { active: !x.active }), 'Updated')}>{x.active ? 'Hide' : 'Show'}</Button> }]} />}</Async></>
  );
}
