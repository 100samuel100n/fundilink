'use client';
import React, { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { kes, newIdempotencyKey, PRICING_LABEL, type BookingKind, type LineInput, type ProProfile } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, Chip, Select, TextArea, TextField } from '@/components/ui';
import { PayModeChooser } from '@/components/payments';
import { AddressSearch } from '@/components/AddressSearch';

type Svc = ProProfile['services'][number];
const QTY_LABEL: Record<string, string> = { hourly: 'Hours', daily: 'Days', per_unit: 'Units', per_sqm: 'Square metres' };

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const st = useAsync(() => api.profile(slug), [slug]);
  return <Async state={st}>{(p) => <Suspense><Wizard p={p} /></Suspense>}</Async>;
}

function Wizard({ p }: { p: ProProfile }) {
  const router = useRouter(); const t = useToast(); const sp = useSearchParams();
  const [step, setStep] = useState(0);
  const [svcId, setSvcId] = useState(p.services[0]?.id ?? '');
  const svc: Svc | undefined = p.services.find((s) => s.id === svcId);
  const [pi, setPi] = useState(0);
  const [qty, setQty] = useState(1);
  const [kind, setKind] = useState<BookingKind>(sp.get('emergency') ? 'emergency' : 'scheduled');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [when, setWhen] = useState('');
  const [addr, setAddr] = useState('');
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const modes = p.paymentModes?.length ? p.paymentModes : (['escrow'] as ('escrow' | 'direct')[]);
  const [mode, setMode] = useState<'escrow' | 'direct'>(modes[0]);
  const [dmethod, setDmethod] = useState<'cash' | 'mpesa'>('cash');
  const locs = useAsync(() => api.locations().catch(() => []), []);
  const [idem] = useState(() => newIdempotencyKey());

  useEffect(() => {
    const rb = sp.get('rebook');
    if (rb) api.rebook(rb).then((r) => setAddr(r.address)).catch(() => {});
  }, [sp]);

  const price = svc?.pricing[pi];
  const unit = kind === 'emergency' && price?.emergency ? price.emergency : price?.amount ?? 0;
  const hasQty = !!price && price.model in QTY_LABEL;
  const lines: LineInput[] = price && unit ? [{ label: svc!.name, kind: 'labour', quantity: hasQty ? qty : 1, unitAmount: Math.max(unit, price.min || 0) }] : [];
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0);
  const quotationOnly = !!price && (price.model === 'quotation' || price.model === 'project' || price.amount == null);
  const labels = ['Service', 'Describe', 'When & where', 'Confirm'];

  
  const submit = async () => {
    if (!pt || !svc || !price) return;
    setBusy(true);
    try {
      const keys: string[] = [];
      for (const f of files.slice(0, 5)) keys.push(await api.uploadFile('problem', f, f.type || 'image/jpeg'));
      const start = kind === 'emergency' ? new Date() : new Date(when);
      const r = await api.createBooking({ professionalId: p.id, professionalServiceId: svc.id, kind, description: desc, address: addr, lat: pt.lat, lng: pt.lng, startsAt: start.toISOString(), durationMinutes: price.model === 'hourly' ? qty * 60 : svc.duration_minutes, lines, attachmentKeys: keys, paymentMode: mode, directMethod: mode === 'direct' ? dmethod : undefined });
      router.push(`/app/bookings/${r.booking.id}`);
    } catch (e) { t.err(errMsg(e)); setBusy(false); }
  };

  return (
    <div className="narrow">
      <h1 style={{ fontSize: '1.6rem' }}>Book {p.businessName ?? p.name}</h1>
      <div className="wizard-steps" aria-hidden>{labels.map((l, i) => <i key={l} className={i <= step ? 'on' : ''} />)}</div>
      <p className="muted small">Step {step + 1} of {labels.length}: {labels[step]}</p>

      {step === 0 ? (
        <Card>
          {!p.services.length ? <p>This professional has not listed services. <a href="/app/quotations/new">Request a quotation</a>.</p> : (
            <>
              <Select label="Service" value={svcId} onChange={(e) => { setSvcId(e.target.value); setPi(0); }} options={p.services.map((s) => ({ value: s.id, label: s.name }))} />
              <div className="lbl">Pricing</div>
              <div className="chips">{svc?.pricing.map((x, i) => <Chip key={i} on={pi === i} onClick={() => setPi(i)} label={`${PRICING_LABEL[x.model]}${x.amount != null ? ` · ${kes(x.amount)}` : ''}`} />)}</div>
              {hasQty ? <TextField label={QTY_LABEL[price!.model]} type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} /> : null}
              {quotationOnly ? <p className="banner">This service is priced after assessment. <a href="/app/quotations/new">Request a quotation</a> instead.</p> : null}
              <div className="lbl" style={{ marginTop: 8 }}>How soon?</div>
              <div className="chips">{(['scheduled', 'instant', ...(p.acceptsEmergency ? ['emergency'] : [])] as BookingKind[]).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)} label={k === 'emergency' ? 'Emergency' : k === 'instant' ? 'As soon as possible' : 'Pick a date'} />)}</div>
              {kind === 'emergency' ? <p className="small muted">Emergency rate applies if the professional has set one. No arrival time is guaranteed until they accept. For gas leaks or sparking wires, leave the area and call emergency services first.</p> : null}
            </>
          )}
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <TextArea label="Describe the job" hint="What is wrong, what you need done, anything the professional should know." value={desc} onChange={(e) => setDesc(e.target.value)} />
          <AiHelper onUse={(s) => setDesc(s)} category={svc?.name} />
          <div className="field"><label htmlFor="ph">Photos (optional, up to 5)</label><input id="ph" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /><span className="hint">{files.length} selected</span></div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          {kind !== 'emergency' ? <TextField label="Date and time" type="datetime-local" value={when} min={new Date(Date.now() + 36e5).toISOString().slice(0, 16)} onChange={(e) => setWhen(e.target.value)} /> : <p className="muted">Emergency: the professional is asked to come now.</p>}
          {locs.data?.length ? <Select label="Saved location" value="" onChange={(e) => { const l = locs.data!.find((x) => x.id === e.target.value); if (l) { setAddr(l.address); setPt({ lat: l.lat, lng: l.lng }); } }} options={[{ value: '', label: 'Choose a saved location…' }, ...locs.data.map((l) => ({ value: l.id, label: `${l.label}: ${l.address}` }))]} /> : null}
          <AddressSearch value={addr} near={pt}
           onChange={(v) => { setAddr(v); setPt(null); }}
           onPick={(p) => { setAddr(p.address); setPt({ lat: p.lat, lng: p.lng }); }} />
          <p className="small muted">{pt ? `Pinned at ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}. Your address is shared with the professional only after they accept.` : 'A GPS pin is needed so the professional can navigate to you and travel fees are exact.'}</p>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="invoice">
          <h3>Summary</h3>
          <p className="muted small">{svc?.name} · {kind === 'emergency' ? 'Emergency' : when ? new Date(when).toLocaleString('en-KE') : 'ASAP'}<br />{addr}</p>
          {lines.map((l, i) => <div className="line" key={i}><span>{l.label} × {l.quantity}</span><span>{kes(l.quantity * l.unitAmount)}</span></div>)}
          <div className="line total"><span>Service subtotal</span><span>{kes(subtotal)}</span></div>
          <p className="small muted">{mode === 'direct' ? 'Travel charges (if any) are included. You pay the total on site.' : 'Platform fee, any travel charge and tax are added and shown in full before you pay.'} The professional cannot raise the price without your approval.</p>
          {modes.length > 1 ? <PayModeChooser modes={modes} value={mode} onChange={setMode} method={dmethod} onMethod={setDmethod} subtotal={subtotal} /> : null}
        </Card>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        {step > 0 ? <Button tone="ghost" onClick={() => setStep(step - 1)}>Back</Button> : null}
        <span className="spacer" />
        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)} disabled={(step === 0 && (!svc || quotationOnly || !unit)) || (step === 1 && desc.trim().length < 10) || (step === 2 && (!addr || !pt || (kind !== 'emergency' && !when)))}>Continue</Button>
        ) : <Button loading={busy} onClick={submit}>{mode === 'direct' ? 'Request booking' : 'Continue to payment'}</Button>}
      </div>
      <input type="hidden" value={idem} readOnly />
    </div>
  );
}

function AiHelper({ onUse, category }: { onUse: (s: string) => void; category?: string }) {
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [q, setQ] = useState('');
  const [ans, setAns] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useToast();
  const [last, setLast] = useState<Awaited<ReturnType<typeof api.brief>> | null>(null);
  const call = async (h: typeof hist) => { setBusy(true); try { const r = await api.brief(h, category); setLast(r); if (!r.done) setHist([...h, { role: 'assistant', content: r.question }]); } catch (e) { t.err(errMsg(e)); } setBusy(false); };
  if (!open) return <Button tone="secondary" small onClick={() => { setOpen(true); setQ(''); }}>✨ Help me describe it</Button>;
  return (
    <Card className="flat" style={{ marginBottom: 12 }}>
      {!hist.length && !last ? <><TextField label="In a few words, what is the problem?" value={q} onChange={(e) => setQ(e.target.value)} /><Button loading={busy} disabled={q.length < 3} onClick={() => { const h = [{ role: 'user' as const, content: q }]; setHist(h); call(h); }}>Next</Button></> : null}
      {last && !last.done ? <><p><strong>{last.question}</strong></p><TextField label="Your answer" value={ans} onChange={(e) => setAns(e.target.value)} /><Button loading={busy} disabled={!ans} onClick={() => { const h = [...hist, { role: 'user' as const, content: ans }]; setHist(h); setAns(''); call(h); }}>Next</Button></> : null}
      {last?.done ? <><p><strong>{last.title}</strong></p><p>{last.summary}</p>{last.suggestedPhotos.length ? <p className="small muted">Useful photos: {last.suggestedPhotos.join(', ')}</p> : null}{last.safetyNote ? <p className="banner">{last.safetyNote}</p> : null}<Button onClick={() => { onUse(`${last.title}\n${last.summary}\n${last.details.map((d) => `- ${d}`).join('\n')}`); setOpen(false); }}>Use this description</Button><p className="small muted">This is a description aid, not a diagnosis.</p></> : null}
    </Card>
  );
}
