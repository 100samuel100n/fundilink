'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, Select, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { approved: 'success', pending: 'warning', rejected: 'danger', expired: 'danger', suspended: 'danger', revoked: 'danger' };
const LABEL: Record<string, string> = { basic: 'Phone / email', identity: 'Identity', qualification: 'Qualification', business: 'Business' };
export default function Verification() {
  const t = useToast(); const v = useAsync(() => api.verification());
  const file = useRef<HTMLInputElement>(null);
  const [d, setD] = useState({ kind: 'national_id', idNumber: '' });
  const [q, setQ] = useState({ kind: 'certificate', title: '', issuer: '', referenceNo: '', expiresOn: '' });
  const [qFile, setQFile] = useState<File | null>(null);
  const [biz, setBiz] = useState({ registrationNo: '', kraPin: '' }); const bizFile = useRef<HTMLInputElement>(null);
  const up = async (f: File, purpose: 'document') => api.uploadFile(purpose, f, f.type || 'application/octet-stream');
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); t.ok(ok); v.reload(); } catch (e) { t.err(errMsg(e)); } };
  return (
    <><PageTitle title="Verification" sub="Each badge is separate and shown to customers honestly. Qualifications are optional unless your category is licensed." />
      <Async state={v}>{(x) => (
        <div className="stack" style={{ gap: 20 }}>
          <div className="grid g4">{['identity', 'qualification', 'business'].map((l) => { const row = x.levels.find((r: any) => r.level === l); return <Card key={l}><div className="muted small">{LABEL[l]}</div><Badge tone={TONE[row?.state] ?? 'neutral'}>{row?.state ?? 'not submitted'}</Badge>{row?.decision_reason && <p className="small">{row.decision_reason}</p>}</Card>; })}</div>
          {x.licenceGaps.length > 0 && <Card><h3>Licences needed</h3><ul>{x.licenceGaps.map((g: any) => <li key={g.name}>{g.name}: licence from {g.license_body ?? 'the relevant body'} before the qualification badge and these listings are enabled.</li>)}</ul></Card>}
          <div className="grid g2">
            <Card><h3>Identity document</h3>
              <Select label="Document" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })} options={[{ value: 'national_id', label: 'National ID' }, { value: 'passport', label: 'Passport' }, { value: 'kra_pin', label: 'KRA PIN certificate' }]} />
              <TextField label="Document number (stored encrypted)" value={d.idNumber} onChange={(e) => setD({ ...d, idNumber: e.target.value })} />
              <input ref={file} type="file" accept="image/*,application/pdf" aria-label="Document file" />
              <Button onClick={() => run(async () => { const f = file.current?.files?.[0]; if (!f) throw new Error('Choose a file'); await api.addDocument({ kind: d.kind as any, storageKey: await up(f, 'document'), idNumber: d.idNumber || undefined }); }, 'Submitted for review')}>Upload</Button></Card>
            <Card><h3>Add a qualification (optional)</h3>
              <Select label="Type" value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value })} options={['certificate', 'licence', 'education', 'membership', 'training'].map((k) => ({ value: k, label: k }))} />
              <TextField label="Title" value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} /><TextField label="Issuer" value={q.issuer} onChange={(e) => setQ({ ...q, issuer: e.target.value })} />
              <TextField label="Reference / licence no." value={q.referenceNo} onChange={(e) => setQ({ ...q, referenceNo: e.target.value })} /><TextField label="Expires on" type="date" value={q.expiresOn} onChange={(e) => setQ({ ...q, expiresOn: e.target.value })} />
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setQFile(e.target.files?.[0] ?? null)} aria-label="Qualification file" />
              <Button disabled={q.title.length < 2} onClick={() => run(async () => api.addQualification({ kind: q.kind as any, title: q.title, issuer: q.issuer || undefined, referenceNo: q.referenceNo || undefined, expiresOn: q.expiresOn || undefined, documentKey: qFile ? await up(qFile, 'document') : undefined }), 'Added')}>Save qualification</Button></Card>
            <Card><h3>Business registration</h3><p className="muted small">For registered companies only.</p>
              <TextField label="Registration number" value={biz.registrationNo} onChange={(e) => setBiz({ ...biz, registrationNo: e.target.value })} /><TextField label="KRA PIN (optional)" value={biz.kraPin} onChange={(e) => setBiz({ ...biz, kraPin: e.target.value })} />
              <input ref={bizFile} type="file" accept="image/*,application/pdf" aria-label="Certificate file" />
              <Button disabled={biz.registrationNo.length < 3} onClick={() => run(async () => { const f = bizFile.current?.files?.[0]; if (!f) throw new Error('Choose a file'); await api.verifyBusiness({ registrationNo: biz.registrationNo, kraPin: biz.kraPin || undefined, documentKey: await up(f, 'document') }); }, 'Submitted')}>Submit</Button></Card>
          </div>
          <Card><h3>Your qualifications</h3><DataTable rows={x.qualifications as { id?: string; kind: string; title: string; issuer?: string | null; expires_on?: string | null }[]} empty="None added" cols={[{ h: 'Type', cell: (r) => r.kind }, { h: 'Title', cell: (r) => r.title }, { h: 'Issuer', cell: (r) => r.issuer ?? '—' }, { h: 'Expires', cell: (r) => r.expires_on ?? '—' }]} /></Card>
        </div>)}</Async></>
  );
}
