'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Check, PageTitle, Select, TextArea, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

export default function Content() {
  const t = useToast(); const s = useAsync(() => api.adminX.content());
  const [f, setF] = useState({ slug: '', kind: 'page', title: '', body: '', published: false });
  return (
    <><PageTitle title="Content" sub="Static pages, FAQs, articles, banners and testimonials (real, consented ones only)." />
      <Card style={{ maxWidth: 720, marginBottom: 20 }}><h3>{f.slug ? 'Edit' : 'New'} content</h3>
        <div className="row wrap-r"><TextField label="Slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
          <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={['page', 'article', 'faq', 'testimonial', 'banner'].map((v) => ({ value: v, label: v }))} /></div>
        <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><TextArea label="Body" rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <Check label="Published" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />
        <Button disabled={!f.slug || !f.title} onClick={async () => { try { await api.adminX.saveContent(f.slug, { kind: f.kind, title: f.title, body: f.body, published: f.published }); t.ok('Saved'); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Save</Button></Card>
      <Async state={s}>{(rows) => <DataTable rows={rows} cols={[{ h: 'Slug', cell: (x) => x.slug }, { h: 'Type', cell: (x) => x.kind }, { h: 'Title', cell: (x) => x.title }, { h: 'Live', cell: (x) => <Badge tone={x.published ? 'success' : 'neutral'}>{x.published ? 'Published' : 'Draft'}</Badge> }, { h: '', cell: (x) => <Button small tone="secondary" onClick={() => setF({ slug: x.slug, kind: x.kind, title: x.title, body: x.body, published: x.published })}>Edit</Button> }]} />}</Async></>
  );
}
