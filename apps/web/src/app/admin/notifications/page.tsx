'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, TextArea, TextField } from '@/components/ui';

type Def = { key: string; group: string; audience: string; when: string; channels: string[]; vars: string[]; title: string; body: string; essential?: boolean };
type Ov = { title?: string; body?: string; sms?: string };
type Data = { templates: Def[]; overrides: Record<string, Ov>; sample: Record<string, string> };

const AUDIENCE: Record<string, string> = { all: 'All', customer: 'Customers', professional: 'Professionals', team: 'Team', any: 'Everyone' };
const CHANNEL: Record<string, string> = { in_app: 'In-app', push: 'Push', sms: 'SMS', email: 'Email' };
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => v[k] ?? '');

export default function Templates() {
  const d = useAsync(() => api.adminX.templates());
  return (
    <>
      <PageTitle title="Notification templates" sub="Every message the platform sends. Edit the wording customers and professionals see. Use the placeholders shown on each card; changes apply within a minute and every change is audited." />
      <Async state={d}>{(data: Data) => <Body data={data} reload={d.reload} />}</Async>
    </>
  );
}

function Body({ data, reload }: { data: Data; reload: () => void }) {
  const [aud, setAud] = useState('all');
  const [q, setQ] = useState('');
  const shown = data.templates.filter((t) => (aud === 'all' || t.audience === aud || t.audience === 'any') && (!q || `${t.key} ${t.title} ${t.when}`.toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(shown.map((t) => t.group))];
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row wrap-r" style={{ alignItems: 'end' }}>
        <div className="chips">{Object.entries(AUDIENCE).map(([k, v]) => <button key={k} className={`chip ${aud === k ? 'on' : ''}`} onClick={() => setAud(k)}>{v}</button>)}</div>
        <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!shown.length ? <p className="muted">No templates match.</p> : null}
      {groups.map((g) => (
        <section key={g}>
          <h2 style={{ marginBottom: 10 }}>{g}</h2>
          <div className="grid g2">{shown.filter((t) => t.group === g).map((t) => <TemplateCard key={`${t.key}:${JSON.stringify(data.overrides[t.key] ?? null)}`} def={t} ov={data.overrides[t.key]} sample={data.sample} reload={reload} />)}</div>
        </section>
      ))}
    </div>
  );
}

function TemplateCard({ def, ov, sample, reload }: { def: Def; ov?: Ov; sample: Record<string, string>; reload: () => void }) {
  const t = useToast();
  const [title, setTitle] = useState(ov?.title ?? def.title);
  const [body, setBody] = useState(ov?.body ?? def.body);
  const [sms, setSms] = useState(ov?.sms ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = title !== (ov?.title ?? def.title) || body !== (ov?.body ?? def.body) || sms !== (ov?.sms ?? '');
  const smsText = (sms ? fill(sms, sample) : `${fill(title, sample)}: ${fill(body, sample)}`).slice(0, 300);
  const guard = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); t.ok(ok); reload(); } catch (e: any) { t.err(e?.status === 403 ? 'Your account cannot change templates' : errMsg(e)); } finally { setBusy(false); } };
  return (
    <Card>
      <div className="row wrap-r" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <code className="small">{def.key}</code>
        <div className="row wrap-r" style={{ gap: 6 }}>
          {ov ? <Badge tone="warning">Edited</Badge> : <Badge>Default</Badge>}
          {def.essential ? <Badge tone="danger">Cannot be muted</Badge> : null}
        </div>
      </div>
      <p className="muted small" style={{ margin: '6px 0 10px' }}>{def.when}</p>
      <div className="row wrap-r" style={{ gap: 6, marginBottom: 8 }}>{def.channels.map((c) => <Badge key={c}>{CHANNEL[c] ?? c}</Badge>)}</div>
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextArea label="Message" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      {def.channels.includes('sms') ? <TextField label="SMS wording (optional, 300 characters max)" value={sms} onChange={(e) => setSms(e.target.value)} /> : null}
      {def.vars.length ? <div className="small muted" style={{ margin: '4px 0 8px' }}>Placeholders: {def.vars.map((v) => <button key={v} type="button" className="chip" style={{ marginRight: 4 }} onClick={() => setBody((b) => `${b}{{${v}}}`)}>{`{{${v}}}`}</button>)}</div> : <p className="small muted">No placeholders for this message.</p>}
      <div className="card" style={{ background: 'var(--surface-2)', padding: 12, margin: '8px 0' }}>
        <div className="small muted">Preview</div>
        <div style={{ fontWeight: 700 }}>{fill(title, sample)}</div>
        <div>{fill(body, sample)}</div>
        {def.channels.includes('sms') ? <div className="small muted" style={{ marginTop: 6 }}>SMS ({smsText.length}/300): {smsText}</div> : null}
      </div>
      {dirty ? <TextField label="Reason for change (kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
      <div className="row wrap-r" style={{ marginTop: 8 }}>
        <Button small loading={busy} disabled={!dirty || reason.trim().length < 5 || title.trim().length < 2 || body.trim().length < 2} onClick={() => guard(() => api.adminX.saveTemplate(def.key, { title, body, sms: sms || undefined, reason }), 'Template saved')}>Save</Button>
        {ov ? <Button small tone="secondary" loading={busy} onClick={() => guard(() => api.adminX.resetTemplate(def.key, 'Reset to default wording'), 'Reset to default')}>Reset to default</Button> : null}
      </div>
    </Card>
  );
}