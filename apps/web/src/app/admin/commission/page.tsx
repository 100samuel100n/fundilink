'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Check, PageTitle, Select, TextArea, TextField } from '@/components/ui';

type Rule = { id: number; category_id: number | null; category: string | null; kind: string | null; organization_id: string | null; organization: string | null; commission_bps: number; customer_fee_bps: number; priority: number; active: boolean };
type Data = { rules: Rule[]; categories: { id: number; name: string }[]; organizations: { id: string; name: string }[] };

const KINDS = [{ value: 'instant', label: 'Instant' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'quotation', label: 'Quotation' }, { value: 'emergency', label: 'Emergency' }];
const kindLabel = (k: string | null) => KINDS.find((x) => x.value === k)?.label ?? k ?? '';
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
const isDefault = (r: Rule) => r.category_id == null && !r.kind && !r.organization_id;
const cut = (minor: number, bps: number) => Math.round((minor * bps) / 10000);
const FALLBACK = { commission_bps: 500, customer_fee_bps: 0 };

/** Same order the booking engine uses: business > category > booking type > platform default. */
function pick(rules: Rule[], q: { categoryId: number | null; kind: string; orgId: string | null }): Rule | undefined {
  return rules
    .filter((r) => r.active && (!r.kind || r.kind === q.kind) && (r.category_id == null || r.category_id === q.categoryId) && (!r.organization_id || r.organization_id === q.orgId))
    .sort((a, b) => (Number(!!b.organization_id) - Number(!!a.organization_id)) || (Number(b.category_id != null) - Number(a.category_id != null)) || (Number(!!b.kind) - Number(!!a.kind)) || (b.priority - a.priority) || (b.id - a.id))[0];
}

function Scope({ r }: { r: Rule }) {
  if (isDefault(r)) return <Badge tone="success">All bookings (platform default)</Badge>;
  return (
    <div className="row wrap-r" style={{ gap: 6 }}>
      {r.organization ? <Badge>Business: {r.organization}</Badge> : null}
      {r.category ? <Badge>Category: {r.category}</Badge> : null}
      {r.kind ? <Badge>{kindLabel(r.kind)} bookings</Badge> : null}
    </div>
  );
}

export default function CommissionRules() {
  const d = useAsync(() => api.admin.commissionRules());
  return (
    <>
      <PageTitle title="Commission rules" sub="Charge a different rate for a service category, a booking type or a specific business. The most specific rule wins. Changes apply to new bookings only, and every change is audited with its reason." />
      <Async state={d}>{(data: Data) => <Body data={data} reload={d.reload} />}</Async>
    </>
  );
}

function Body({ data, reload }: { data: Data; reload: () => void }) {
  const t = useToast();
  const blank = { categoryId: '', kind: '', orgId: '', pct: '', fee: '', reason: '' };
  const [f, setF] = useState(blank);
  const [off, setOff] = useState<{ rule: Rule; reason: string } | null>(null);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState({ categoryId: '', kind: 'instant', orgId: '', amount: '5000' });

  const rules = data.rules;
  const active = rules.filter((r) => r.active);
  const def = active.find(isDefault);
  const shown = history ? rules : active;

  // ---- form ----
  const scope = { categoryId: f.categoryId ? Number(f.categoryId) : null, kind: f.kind || null, orgId: f.orgId || null };
  const hasScope = scope.categoryId != null || !!scope.kind || !!scope.orgId;
  const existing = hasScope ? active.find((r) => (r.category_id ?? null) === scope.categoryId && (r.kind ?? null) === scope.kind && (r.organization_id ?? null) === scope.orgId) : undefined;
  const pctN = Number(f.pct);
  const feeN = f.fee === '' ? 0 : Number(f.fee);
  const valid = hasScope && f.pct !== '' && Number.isFinite(pctN) && pctN >= 0 && pctN <= 30 && Number.isFinite(feeN) && feeN >= 0 && feeN <= 20 && f.reason.trim().length >= 5;
  const exMinor = 500000; // KSh 5,000 example

  const save = async () => {
    setBusy(true);
    try {
      await api.admin.saveCommissionRule({ categoryId: scope.categoryId ?? undefined, kind: scope.kind ?? undefined, organizationId: scope.orgId ?? undefined, commissionBps: Math.round(pctN * 100), customerFeeBps: Math.round(feeN * 100), reason: f.reason });
      t.ok(existing ? 'Rule updated' : 'Rule added'); setF(blank); reload();
    } catch (e: any) { t.err(e?.status === 403 ? 'Your account cannot change commission rules' : errMsg(e)); } finally { setBusy(false); }
  };
  const edit = (r: Rule) => {
    setF({ categoryId: r.category_id != null ? String(r.category_id) : '', kind: r.kind ?? '', orgId: r.organization_id ?? '', pct: String(r.commission_bps / 100), fee: r.customer_fee_bps ? String(r.customer_fee_bps / 100) : '', reason: '' });
    document.getElementById('rule-form')?.scrollIntoView({ behavior: 'smooth' });
  };
  const turnOff = async () => {
    if (!off) return;
    setBusy(true);
    try { await api.admin.turnOffCommissionRule(off.rule.id, off.reason); t.ok('Rule turned off'); setOff(null); reload(); }
    catch (e: any) { t.err(e?.status === 403 ? 'Your account cannot change commission rules' : errMsg(e)); } finally { setBusy(false); }
  };

  // ---- rate checker ----
  const hit = pick(rules, { categoryId: q.categoryId ? Number(q.categoryId) : null, kind: q.kind, orgId: q.orgId || null });
  const applied = hit ?? FALLBACK;
  const jobMinor = Math.round(Number(q.amount || 0) * 100);
  const com = cut(jobMinor, applied.commission_bps);
  const fee = cut(jobMinor, applied.customer_fee_bps);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Card>
        <div className="row wrap-r" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Platform default</h3>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Used whenever no more specific rule matches.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{pct(def?.commission_bps ?? FALLBACK.commission_bps)}</div>
            <div className="muted small">commission · {pct(def?.customer_fee_bps ?? 0)} customer fee</div>
            <Link className="small" href="/admin/settings">Change the default</Link>
          </div>
        </div>
      </Card>

      <Card>
        <div className="row wrap-r" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Rules</h3>
          <Check label="Show history" checked={history} onChange={(e) => setHistory(e.target.checked)} />
        </div>
        <div className="tablewrap"><table>
          <thead><tr><th>Applies to</th><th>Commission</th><th>Customer fee</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><Scope r={r} /></td>
                <td className="money"><b>{pct(r.commission_bps)}</b></td>
                <td className="money">{pct(r.customer_fee_bps)}</td>
                <td><Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Replaced or off'}</Badge></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.active && !isDefault(r) ? <><Button small tone="secondary" onClick={() => edit(r)}>Edit</Button>{' '}<Button small tone="secondary" onClick={() => setOff({ rule: r, reason: '' })}>Turn off</Button></> : null}
                </td>
              </tr>
            ))}
            {!shown.length ? <tr><td colSpan={5} className="muted">No rules yet.</td></tr> : null}
          </tbody>
        </table></div>
        {!active.some((r) => !isDefault(r)) ? <p className="small muted">Only the platform default applies right now. Add a rule below to charge a different rate for a category, booking type or business.</p> : null}
      </Card>

      {off ? (
        <Card>
          <h3>Turn off this rule?</h3>
          <p className="muted small">Matching bookings go back to the next most specific rule, or the platform default. Existing bookings keep their rate.</p>
          <div style={{ margin: '8px 0' }}><Scope r={off.rule} /></div>
          <TextArea label="Reason (kept in the audit log)" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} />
          <div className="row wrap-r" style={{ marginTop: 10 }}>
            <Button loading={busy} disabled={off.reason.trim().length < 5} onClick={turnOff}>Turn off rule</Button>
            <Button tone="secondary" onClick={() => setOff(null)}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div id="rule-form" />
        <h3>{existing ? 'Update a rule' : 'Add a rule'}</h3>
        <p className="muted small">Choose at least one of category, booking type or business. Leave the others on “Any”.</p>
        <div className="grid g2">
          <Select label="Service category" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} options={[{ value: '', label: 'Any category' }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label="Booking type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: '', label: 'Any booking type' }, ...KINDS]} />
          <Select label="Business account" value={f.orgId} onChange={(e) => setF({ ...f, orgId: e.target.value })} options={[{ value: '', label: 'Any business' }, ...data.organizations.map((o) => ({ value: o.id, label: o.name }))]} />
          <div />
          <TextField label="Professional commission (%)" hint="0 to 30" inputMode="decimal" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} />
          <TextField label="Customer service fee (%) optional" hint="0 to 20. In-app payments only" inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
        </div>
        {hasScope && f.pct !== '' && Number.isFinite(pctN) ? (
          <p className="small muted">Example, a {kes(exMinor)} job: commission {kes(cut(exMinor, Math.round(pctN * 100)))}, professional receives {kes(exMinor - cut(exMinor, Math.round(pctN * 100)))}{feeN > 0 ? `, customer pays ${kes(exMinor + cut(exMinor, Math.round(feeN * 100)))} in-app` : ''}.</p>
        ) : null}
        {existing ? <p className="banner" role="status">This replaces the current {pct(existing.commission_bps)} rule for the same scope.</p> : null}
        <TextArea label="Reason for change (kept in the audit log)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <div className="row wrap-r" style={{ marginTop: 10 }}>
          <Button loading={busy} disabled={!valid} onClick={save}>{existing ? 'Update rule' : 'Add rule'}</Button>
          <Button tone="secondary" onClick={() => setF(blank)}>Clear</Button>
        </div>
      </Card>

      <Card>
        <h3>Check a rate</h3>
        <p className="muted small">See which rule would apply to a job, before any customer books it.</p>
        <div className="grid g2">
          <Select label="Service category" value={q.categoryId} onChange={(e) => setQ({ ...q, categoryId: e.target.value })} options={[{ value: '', label: 'Not specified' }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label="Booking type" value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value })} options={KINDS} />
          <Select label="Business account" value={q.orgId} onChange={(e) => setQ({ ...q, orgId: e.target.value })} options={[{ value: '', label: 'Individual customer' }, ...data.organizations.map((o) => ({ value: o.id, label: o.name }))]} />
          <TextField label="Job amount (KSh)" inputMode="numeric" value={q.amount} onChange={(e) => setQ({ ...q, amount: e.target.value.replace(/[^\d]/g, '') })} />
        </div>
        <div style={{ marginTop: 12 }}>{hit ? <Scope r={hit} /> : <Badge tone="warning">Built-in default (no default rule is set)</Badge>}</div>
        <div className="tablewrap" style={{ marginTop: 10 }}><table><tbody>
          <tr><td>Commission ({pct(applied.commission_bps)})</td><td className="money" style={{ textAlign: 'right' }}>{kes(com)}</td></tr>
          <tr><td>Professional receives</td><td className="money" style={{ textAlign: 'right' }}>{kes(jobMinor - com)}</td></tr>
          <tr><td>Customer fee, in-app only ({pct(applied.customer_fee_bps)})</td><td className="money" style={{ textAlign: 'right' }}>{kes(fee)}</td></tr>
          <tr><td>Customer pays, in-app</td><td className="money" style={{ textAlign: 'right' }}><b>{kes(jobMinor + fee)}</b></td></tr>
          <tr><td>Customer pays, pay on site</td><td className="money" style={{ textAlign: 'right' }}>{kes(jobMinor)} <span className="muted small">(commission {kes(com)} is taken from the professional's wallet)</span></td></tr>
        </tbody></table></div>
        <p className="small muted">Estimate on the job subtotal. Travel fees and extras are added to the subtotal before the percentage is applied.</p>
      </Card>
    </div>
  );
}