'use client';
import React, { useEffect, useRef, useState } from 'react';
import { kes, newIdempotencyKey, normalizeMsisdn, prettyPhone, timeAgo, type BookingDetail, type LineInput, type PaymentIntent, type PaymentMode, type Revision } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Badge, Button, Card, TextArea, TextField } from './ui';

const LAST_PHONE = 'fl.momo';

/* =====================================================================================================
   MpesaSheet: one component for every M-Pesa collection (booking, extra work, wallet top-up).
   idle -> prompt sent (live countdown) -> success (receipt) | failed (plain-language reason, one tap to retry)
   ===================================================================================================== */
export function MpesaSheet({ amount, title, cta, start, onDone, note, compact }: {
  amount: number | string; title?: string; cta?: string; note?: string; compact?: boolean;
  start: (phone: string, idempotencyKey: string) => Promise<PaymentIntent>;
  onDone: (pi: PaymentIntent) => void;
}) {
  const t = useToast();
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<'idle' | 'starting' | 'waiting' | 'ok' | 'failed'>('idle');
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(0);
  const key = useRef<string | null>(null);
  const done = useRef(false);

  useEffect(() => { try { const p = localStorage.getItem(LAST_PHONE); if (p) setPhone(p); } catch { /* storage blocked */ } }, []);
  const valid = !!normalizeMsisdn(phone);

  const begin = async () => {
    if (!valid || phase === 'starting') return;
    setErr(''); setPhase('starting'); done.current = false;
    key.current ??= newIdempotencyKey(); // one key per attempt: a double tap can never charge twice
    try {
      try { localStorage.setItem(LAST_PHONE, phone); } catch { /* ignore */ }
      const pi = await start(phone, key.current);
      setIntent(pi);
      if (pi.status === 'failed') throw new Error(pi.failure_reason || 'The payment did not go through.');
      setPhase(pi.status === 'succeeded' ? 'ok' : 'waiting');
    } catch (e) { key.current = null; setErr(errMsg(e)); setPhase('failed'); }
  };

  // poll the intent while the customer approves the prompt on their phone
  useEffect(() => {
    if (phase !== 'waiting' || !intent) return;
    let stop = false;
    const tick = async () => {
      try {
        const pi = await api.paymentIntent(intent.id);
        if (stop) return;
        setIntent(pi);
        if (pi.status === 'succeeded') setPhase('ok');
        else if (pi.status === 'failed' || pi.status === 'cancelled') { key.current = null; setErr(pi.failure_reason || 'The payment did not go through.'); setPhase('failed'); }
      } catch { /* keep trying */ }
    };
    const poll = setInterval(tick, 2500);
    const clock = setInterval(() => setLeft(Math.max(0, Math.round((new Date(intent.expires_at ?? Date.now() + 120000).getTime() - Date.now()) / 1000))), 500);
    return () => { stop = true; clearInterval(poll); clearInterval(clock); };
  }, [phase, intent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'ok' || !intent || done.current) return;
    done.current = true;
    const id = setTimeout(() => onDone(intent), 1600); // let the success state land before the page changes
    return () => clearTimeout(id);
  }, [phase, intent, onDone]);

  if (phase === 'ok') return (
    <div className="mp mp-ok pop" role="status">
      <div className="mp-check" aria-hidden><svg viewBox="0 0 52 52" width="56" height="56"><circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M15 27l8 8 14-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      <h3>Payment received</h3>
      <p className="money-lg">{kes(amount)}</p>
      {intent?.receipt ? <p className="small muted">M-Pesa receipt <b className="mono">{intent.receipt}</b></p> : null}
    </div>
  );

  if (phase === 'waiting') return (
    <div className="mp" role="status" aria-live="polite">
      <div className="mp-pulse" aria-hidden><span /><span /><span /><i>M</i></div>
      <h3>Check your phone</h3>
      <p className="muted" style={{ marginBottom: 12 }}>We sent an M-Pesa prompt for <b>{kes(amount)}</b> to <b>{prettyPhone(phone)}</b>. Enter your M-Pesa PIN to approve.</p>
      <ol className="mp-steps">
        <li className="done">Prompt sent</li><li className="now">Enter your M-Pesa PIN</li><li>We confirm instantly</li>
      </ol>
      <p className="small muted" style={{ marginBottom: 12 }}>{left > 0 ? `Prompt expires in ${left}s.` : 'Still waiting. If you already approved it, this will update by itself.'} Never share your PIN with anyone.</p>
      <div className="row wrap-r"><Button tone="ghost" small onClick={() => { key.current = null; setPhase('idle'); }}>Use a different number</Button></div>
    </div>
  );

  return (
    <div className={compact ? 'mp compact' : 'mp'}>
      <div className="row between"><h3 style={{ margin: 0 }}>{title ?? `Pay ${kes(amount)}`}</h3><span className="momo-tag"><i>M</i>M-Pesa</span></div>
      <TextField label="M-Pesa phone number" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)}
        hint="Safaricom number that will receive the prompt." error={phone.length > 4 && !valid ? 'Enter a valid Safaricom number, e.g. 0712 345 678' : undefined} />
      {phase === 'failed' && err ? <p className="banner bad" role="alert">{err}</p> : null}
      <Button block loading={phase === 'starting'} disabled={!valid} onClick={begin}>{phase === 'failed' ? 'Try again' : cta ?? `Pay ${kes(amount)} with M-Pesa`}</Button>
      <p className="small muted" style={{ margin: '12px 0 0' }}>{note ?? 'You will get a prompt on your phone. We never see your PIN.'}</p>
    </div>
  );
}

/* =====================================================================================================
   Booking: choose how to pay (Model 1 escrow vs Model 2 pay-on-site)
   ===================================================================================================== */
export function PayModeChooser({ modes, value, onChange, method, onMethod, subtotal }: {
  modes: PaymentMode[]; value: PaymentMode; onChange: (m: PaymentMode) => void; method: 'cash' | 'mpesa'; onMethod: (m: 'cash' | 'mpesa') => void; subtotal: number;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="lbl">How would you like to pay?</div>
      <div className="modes" role="radiogroup" aria-label="Payment method">
        {modes.includes('escrow') ? (
          <button type="button" role="radio" aria-checked={value === 'escrow'} className={`modecard ${value === 'escrow' ? 'on' : ''}`} onClick={() => onChange('escrow')}>
            <span className="mc-ic" aria-hidden>🛡️</span>
            <span className="mc-body"><b>Pay in the app <span className="badge good">Protected</span></b><small>Pay with M-Pesa now. We hold the money and release it only after you confirm the work. Full refund if the job does not happen.</small></span>
          </button>
        ) : null}
        {modes.includes('direct') ? (
          <button type="button" role="radio" aria-checked={value === 'direct'} className={`modecard ${value === 'direct' ? 'on' : ''}`} onClick={() => onChange('direct')}>
            <span className="mc-ic" aria-hidden>🤝</span>
            <span className="mc-body"><b>Pay the professional on site</b><small>Pay {kes(subtotal)} in cash or M-Pesa when the job is done. Nothing to pay now. You still get live tracking, the start PIN and an in-app receipt.</small></span>
          </button>
        ) : null}
      </div>
      {value === 'direct' ? (
        <div className="chips" role="radiogroup" aria-label="How you will pay on site">
          {(['cash', 'mpesa'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} className={`chip ${method === m ? 'on' : ''}`} onClick={() => onMethod(m)}>{m === 'cash' ? 'Cash' : 'M-Pesa to the professional'}</button>)}
        </div>
      ) : null}
      {value === 'direct' ? <p className="small muted" style={{ margin: 0 }}>Any extra work (for example a replacement part) is still approved in the app before it is added to your total. Promo codes apply to in-app payments only.</p> : null}
    </div>
  );
}

/* =====================================================================================================
   Add-on / Extra work
   ===================================================================================================== */
const PRESETS: { label: string; kind: LineInput['kind'] }[] = [
  { label: 'Replacement part', kind: 'materials' }, { label: 'Extra labour', kind: 'labour' }, { label: 'Specialist tool hire', kind: 'other' }, { label: 'Materials', kind: 'materials' },
];
type Row = { label: string; kind: LineInput['kind']; qty: string; price: string };
const blank = (): Row => ({ label: '', kind: 'materials', qty: '1', price: '' });

/** Professional: log extra work or materials mid-job. The customer is pushed a notification to approve it in-app. */
export function AddonRequestForm({ b, onSent }: { b: BookingDetail; onSent: () => void }) {
  const t = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [discovered, setDiscovered] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const lines: LineInput[] = rows.filter((r) => r.label.trim() && Number(r.price) > 0 && Number(r.qty) > 0).map((r) => ({ label: r.label.trim(), kind: r.kind, quantity: Number(r.qty), unitAmount: Math.round(Number(r.price) * 100) }));
  const total = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitAmount), 0);
  const rate = Number(b.subtotal) > 0 ? Number(b.commission) / Number(b.subtotal) : 0;
  const net = Math.round(total * (1 - rate));
  const direct = b.payment_mode === 'direct';
  const pendingCount = (b.revisions ?? []).filter((r) => r.status === 'pending').length;

  if (!open) return (
    <Card className="addon-cta">
      <div className="row between wrap-r"><div><h3 style={{ margin: 0 }}>Need extra materials or work?</h3><p className="small muted" style={{ margin: '4px 0 0' }}>Log it here. The customer approves in the app{direct ? '' : ' and pays through us'}, so the receipt stays official.</p></div>
        <Button tone="secondary" disabled={pendingCount >= 3} onClick={() => setOpen(true)}>Add extra work</Button></div>
    </Card>
  );

  const send = async () => {
    setBusy(true);
    try {
      const keys: string[] = [];
      for (const f of files.slice(0, 3)) keys.push(await api.uploadFile('evidence', f, f.type || 'image/jpeg'));
      await api.submitRevision(b.id, { discovered, reason: reason || discovered, extraLines: lines, attachmentKeys: keys });
      t.ok('Sent to the customer for approval'); setOpen(false); setRows([blank()]); setDiscovered(''); setReason(''); setFiles([]); onSent();
    } catch (e) { t.err(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Card className="addon-form">
      <div className="row between"><h3 style={{ margin: 0 }}>Add extra work</h3><button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button></div>
      <p className="small muted">Nothing is charged until the customer approves. They are notified straight away.</p>
      <TextArea label="What did you find?" placeholder="e.g. The mixer valve is cracked and leaking behind the wall." value={discovered} onChange={(e) => setDiscovered(e.target.value)} />
      <div className="lbl">Items</div>
      <div className="chips" style={{ marginBottom: 8 }}>{PRESETS.map((p) => <button key={p.label} type="button" className="chip" onClick={() => setRows((r) => { const last = r[r.length - 1]; return last && !last.label ? [...r.slice(0, -1), { ...last, label: p.label, kind: p.kind }] : [...r, { ...blank(), label: p.label, kind: p.kind }]; })}>+ {p.label}</button>)}</div>
      {rows.map((r, i) => (
        <div className="addon-row" key={i}>
          <input aria-label="Item" placeholder="Item (e.g. 22mm brass valve)" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <input aria-label="Quantity" inputMode="decimal" className="qty" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <input aria-label="Price each in KSh" inputMode="decimal" className="price" placeholder="KSh each" value={r.price} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
          {rows.length > 1 ? <button className="btn ghost sm" aria-label="Remove item" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button> : <span />}
        </div>
      ))}
      <button className="btn ghost sm" onClick={() => setRows([...rows, blank()])} style={{ marginBottom: 12 }}>+ Add another item</button>
      <TextField label="Note for the customer (optional)" placeholder="Why it is needed, brand, warranty…" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="field"><label htmlFor="addon-ph">Photo of the problem or part (recommended)</label><input id="addon-ph" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></div>
      <div className="addon-sum"><div className="line"><span>Customer pays</span><b className="money">{kes(total)}</b></div>{direct ? <div className="line muted"><span>Added to the amount you collect on site</span><span /></div> : <div className="line muted"><span>You receive (est. after commission)</span><span>{kes(net)}</span></div>}</div>
      <Button block loading={busy} disabled={!lines.length || discovered.trim().length < 5} onClick={send}>Send to customer for approval</Button>
    </Card>
  );
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(i); }, []);
  const m = Math.max(0, Math.round((new Date(to).getTime() - now) / 60000));
  return <span>{m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`}</span>;
}

const REV_TONE: Record<string, 'warn' | 'good' | 'bad' | 'neutral' | 'info'> = { pending: 'warn', approved: 'info', rejected: 'bad', expired: 'neutral', withdrawn: 'neutral' };

function RevisionItems({ r }: { r: Revision }) {
  return <div className="invoice">{r.items.map((i, k) => <div className="line" key={k}><span>{i.label} <span className="muted small">× {Number(i.quantity)}</span></span><span>{kes(Number(i.quantity) * Number(i.unitAmount))}</span></div>)}<div className="line total"><span>Extra total</span><span>{kes(r.extra_total)}</span></div></div>;
}

/** Both sides: every extra-work request on this booking, with the right actions for each role. */
export function AddonCenter({ b, side, onChange }: { b: BookingDetail; side: 'customer' | 'professional'; onChange: () => void }) {
  const t = useToast();
  const list = b.revisions ?? [];
  const [busy, setBusy] = useState('');
  const [paying, setPaying] = useState<string | null>(null);
  if (!list.length) return null;
  const direct = b.payment_mode === 'direct';

  const decide = async (r: Revision, approve: boolean) => {
    setBusy(r.id + approve);
    try {
      const out = await api.decideRevision(r.id, approve);
      t.ok(approve ? (out.paymentRequired ? 'Approved. Pay to confirm the extra work.' : 'Approved and added to your total') : 'Declined');
      if (approve && out.paymentRequired) setPaying(r.id);
      onChange();
    } catch (e) { t.err(errMsg(e)); }
    setBusy('');
  };
  const withdraw = async (r: Revision) => { setBusy(r.id); try { await api.withdrawRevision(r.id); t.ok('Withdrawn'); onChange(); } catch (e) { t.err(errMsg(e)); } setBusy(''); };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {list.map((r) => {
        const needsApproval = side === 'customer' && r.status === 'pending';
        const needsPay = side === 'customer' && r.status === 'approved' && r.payment_status === 'due';
        return (
          <Card key={r.id} className={`addon ${needsApproval || needsPay ? 'attention' : ''}`}>
            <div className="row between wrap-r"><div className="row"><span className="ico warn" aria-hidden>＋</span><h3 style={{ margin: 0 }}>Extra work</h3></div>
              <span className="row" style={{ gap: 6 }}>{r.payment_status === 'paid' ? <Badge tone="success">Paid</Badge> : null}{r.payment_status === 'due' ? <Badge tone="warn">Payment due</Badge> : null}<Badge tone={REV_TONE[r.status] ?? 'neutral'}>{r.status === 'approved' && direct ? 'Approved' : r.status}</Badge></span></div>
            {r.discovered ? <p style={{ margin: '10px 0 4px' }}><b>Found:</b> {r.discovered}</p> : null}
            {r.reason && r.reason !== r.discovered ? <p className="muted small" style={{ margin: '0 0 8px' }}>{r.reason}</p> : null}
            <RevisionItems r={r} />
            {needsApproval ? (
              <>
                <p className="small muted">Expires in <Countdown to={r.expires_at} />. {direct ? 'Approving adds this to the amount you pay on site.' : 'Nothing is charged until you approve and pay.'}</p>
                <div className="row wrap-r"><Button loading={busy === r.id + true} onClick={() => decide(r, true)}>Approve {kes(r.extra_total)}</Button><Button tone="danger" loading={busy === r.id + false} onClick={() => decide(r, false)}>Decline</Button></div>
              </>
            ) : null}
            {needsPay ? (
              <div style={{ marginTop: 12 }}><MpesaSheet compact amount={r.extra_total} title={`Pay ${kes(r.extra_total)} for the extra work`} cta="Pay with M-Pesa" note="Held with the original payment and released to the professional after you confirm the job."
                start={(phone, key) => api.payAddon({ revisionId: r.id, phone, idempotencyKey: key })} onDone={() => { setPaying(null); onChange(); }} /></div>
            ) : null}
            {side === 'professional' && (r.status === 'pending' || (r.status === 'approved' && r.payment_status === 'due')) ? (
              <div className="row between wrap-r" style={{ marginTop: 10 }}><span className="small muted">{r.status === 'pending' ? <>Waiting for the customer · expires in <Countdown to={r.expires_at} /></> : 'Approved: waiting for the customer to pay. Hold the extra work until it lands.'}</span><Button tone="ghost" small loading={busy === r.id} onClick={() => withdraw(r)}>Withdraw</Button></div>
            ) : null}
            {side === 'professional' && r.status === 'approved' && (r.payment_status === 'paid' || direct) ? <p className="small" style={{ color: 'var(--good-fg)', margin: '10px 0 0', fontWeight: 600 }}>{direct ? 'Approved. Collect the new total on site.' : 'Paid and approved: you can go ahead.'}</p> : null}
            {r.status === 'rejected' ? <p className="small muted" style={{ margin: '10px 0 0' }}>{side === 'customer' ? 'You declined this.' : 'The customer declined. Continue with the original scope.'}</p> : null}
            {r.status === 'expired' ? <p className="small muted" style={{ margin: '10px 0 0' }}>No answer in time. Nothing was charged.</p> : null}
            <p className="small muted" style={{ margin: '8px 0 0' }}>Requested {timeAgo(r.created_at)}</p>
          </Card>
        );
      })}
    </div>
  );
}

/* =====================================================================================================
   Pay on site (Model 2)
   ===================================================================================================== */
export function DirectPayCard({ b, side, onChange }: { b: BookingDetail; side: 'customer' | 'professional'; onChange: () => void }) {
  const t = useToast();
  const dp = b.directPayment;
  const [method, setMethod] = useState<'cash' | 'mpesa'>((b.direct_method as any) ?? 'cash');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  if (b.payment_mode !== 'direct') return null;
  const active = ['confirmed', 'scheduled', 'en_route', 'arrived', 'in_progress', 'awaiting_completion'].includes(b.status);
  const canRecord = side === 'professional' && ['in_progress', 'awaiting_completion'].includes(b.status);

  const record = async () => {
    setBusy(true);
    try { await api.recordDirectPayment(b.id, { method, reference: method === 'mpesa' ? ref : undefined }); t.ok('Payment recorded'); setEdit(false); onChange(); } catch (e) { t.err(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Card className="direct">
      <div className="row between wrap-r"><div className="row"><span className="ico" aria-hidden>🤝</span><h3 style={{ margin: 0 }}>Pay on site</h3></div><Badge tone={dp ? 'success' : 'warn'}>{dp ? 'Payment recorded' : 'To be paid on site'}</Badge></div>
      {side === 'customer' ? (
        <>
          <p className="money-lg" style={{ margin: '12px 0 4px' }}>{kes(b.total)}</p>
          <p className="muted small" style={{ margin: 0 }}>{dp ? `Your professional recorded ${dp.method === 'cash' ? 'cash' : 'an M-Pesa payment'} received. Confirm the job below once you are happy.` : 'Pay your professional directly, in cash or M-Pesa, once the work is done. Please do not pay before then. Extra work is only added after you approve it here.'}</p>
        </>
      ) : (
        <>
          <p className="money-lg" style={{ margin: '12px 0 4px' }}>Collect {kes(b.total)}</p>
          <p className="muted small">You keep the full amount; the platform commission ({kes(Number(b.commission) + Number(b.customer_fee))}) is taken from your wallet when the customer confirms.</p>
          {dp && !edit ? <div className="row between wrap-r"><span className="small">Recorded: <b>{dp.method === 'cash' ? 'Cash' : `M-Pesa ${dp.reference ?? ''}`}</b> · {kes(dp.amount)}</span>{Number(dp.amount) < Number(b.total) || canRecord ? <button className="btn ghost sm" onClick={() => setEdit(true)}>{Number(dp.amount) < Number(b.total) ? 'Re-record (total changed)' : 'Edit'}</button> : null}</div> : null}
          {canRecord && (!dp || edit) ? (
            <div style={{ marginTop: 8 }}>
              <div className="chips" role="radiogroup" aria-label="How was it paid">{(['cash', 'mpesa'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} className={`chip ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)}>{m === 'cash' ? 'Cash received' : 'M-Pesa received'}</button>)}</div>
              {method === 'mpesa' ? <TextField label="M-Pesa confirmation code" placeholder="e.g. SGH7K2L9QX" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} hint="From the SMS you received." /> : null}
              <Button loading={busy} disabled={method === 'mpesa' && ref.trim().length < 8} onClick={record}>Record {kes(b.total)} received</Button>
            </div>
          ) : null}
          {!dp && active && !canRecord ? <p className="small muted" style={{ marginBottom: 0 }}>When the job is done, record how you were paid here, then mark the job finished.</p> : null}
        </>
      )}
    </Card>
  );
}

/** Small label used on lists and headers. */
export function ModeBadge({ mode }: { mode?: string }) {
  return mode === 'direct' ? <span className="badge info">Pay on site</span> : <span className="badge good">Paid in app</span>;
}
