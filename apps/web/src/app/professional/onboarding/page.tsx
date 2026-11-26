'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COUNTY_CENTERS } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, getPosition, useAsync } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { KENYA_COUNTIES } from '@/lib/counties';
import { useToast } from '@/lib/toast';
import { refreshSession } from '@/lib/extra';
import { Button, Card, Check, Chip, Select, TextArea, TextField } from '@/components/ui';

const STEPS = ['Account', 'Identity', 'Profession', 'Qualifications', 'Business', 'Travel & pricing rules', 'Service areas', 'Availability', 'Payout', 'Review & submit'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Onboarding() {
  const router = useRouter(); const t = useToast(); const { session, signOut } = useAuth();
  const cats = useAsync(() => api.categories());
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    displayName: '', headline: '', bio: '', years: '', languages: ['en', 'sw'], county: 'Nairobi', area: '', lat: 0, lng: 0, avatar: null as File | null,
    categoryIds: [] as number[], accountType: 'individual' as 'individual' | 'business', businessName: '', regNo: '',
    freeRadius: '5', maxTravel: '15', perKm: '', minCallOut: '', emergency: false, autoAccept: false,
    areas: '' , days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00',
    payKind: 'mobile_money' as 'mobile_money' | 'bank', payProvider: 'M-Pesa', payRef: '', payName: '',
  });
  const [docs, setDocs] = useState<File[]>([]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const pin = async () => { try { const g = await getPosition(); setF((o) => ({ ...o, ...g })); } catch (e) { t.err(errMsg(e)); } };

  const canNext = [true, f.displayName.length >= 2 && (f.lat !== 0 || !!COUNTY_CENTERS[f.county] || true), f.categoryIds.length > 0, true, f.accountType === 'individual' || f.businessName.length > 1, true, true, f.days.length > 0, true, true][step];

  const submit = async () => {
    setBusy(true);
    try {
      const c = COUNTY_CENTERS[f.county];
      const lat = f.lat || c?.lat || -1.2921; const lng = f.lng || c?.lng || 36.8219;
      if (f.avatar) await api.uploadFile('avatar', f.avatar, f.avatar.type || 'image/jpeg').catch(() => {});
      for (const d of docs) await api.uploadFile('document', d, d.type || 'application/pdf').catch(() => {});
      await api.onboard({
        accountType: f.accountType, displayName: f.displayName, businessName: f.businessName || undefined, headline: f.headline || undefined, bio: f.bio || undefined,
        yearsExperience: f.years ? Number(f.years) : undefined, languages: f.languages, lat, lng, area: f.area || undefined, county: f.county,
        maxTravelKm: Number(f.maxTravel) || 15, freeRadiusKm: Number(f.freeRadius) || 0, perKmAmount: Math.round(Number(f.perKm || 0) * 100), minCallOut: Math.round(Number(f.minCallOut || 0) * 100),
        acceptsEmergency: f.emergency, autoAccept: f.autoAccept, categoryIds: f.categoryIds,
        serviceAreas: [{ county: f.county }, ...f.areas.split(',').map((s) => s.trim()).filter(Boolean).map((a) => ({ county: f.county, estate: a }))],
        availability: f.days.map((weekday) => ({ weekday, start: f.start, end: f.end })),
      });
      if (f.payRef.length >= 6 && f.payName) await api.setPayoutAccount({ kind: f.payKind, provider: f.payProvider, accountRef: f.payRef, accountName: f.payName }).catch((e) => t.err(`Payout account not saved: ${errMsg(e)}`));
      t.ok('Profile submitted for review');
      await refreshSession(); // pick up the new professional role in the token
      router.push('/professional/services');
    } catch (e) { t.err(errMsg(e)); setBusy(false); }
  };

  return (
    <div className="narrow" style={{ margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem' }}>Become a professional</h1>
      <p className="muted">Free to register. You can skip optional parts and finish them later.</p>
      <div className="wizard-steps" aria-hidden>{STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>
      <h2 style={{ fontSize: '1.2rem' }}>Step {step + 1} of {STEPS.length}: {STEPS[step]}</h2>
      <Card>
        {step === 0 ? <><p>You are signed in and your phone is verified. Roles: <strong>{session?.roles.join(', ')}</strong>.</p><p className="small muted">If you registered as a customer, submitting this form adds the professional role to your account.</p></> : null}
        {step === 1 ? <>
          <TextField label="Legal / display name" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} />
          <TextField label="Short headline" placeholder="Licensed plumber, 10 years in Nairobi" maxLength={120} value={f.headline} onChange={(e) => set('headline', e.target.value)} />
          <TextArea label="About you" value={f.bio} onChange={(e) => set('bio', e.target.value)} />
          <div className="field"><label htmlFor="av">Profile photo</label><input id="av" type="file" accept="image/*" onChange={(e) => set('avatar', e.target.files?.[0] ?? null)} /></div>
          <Select label="County" value={f.county} onChange={(e) => set('county', e.target.value)} options={KENYA_COUNTIES.map((c) => ({ value: c, label: c }))} />
          <TextField label="Estate / neighbourhood" value={f.area} onChange={(e) => set('area', e.target.value)} />
          <Button tone="secondary" small onClick={pin}>Pin my base location</Button> <span className="small muted">{f.lat ? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : 'Optional. Defaults to your county centre.'}</span>
          <p className="small muted">ID document upload and checks happen in the verification queue after submission.</p>
        </> : null}
        {step === 2 ? <>
          <div className="lbl" style={{ marginBottom: 8 }}>What do you do? (choose all that apply)</div>
          <div className="chips">{(cats.data ?? []).map((c) => <Chip key={c.id} label={c.name} on={f.categoryIds.includes(c.id)} onClick={() => set('categoryIds', toggle(f.categoryIds, c.id))} />)}</div>
          <TextField label="Years of experience" inputMode="numeric" value={f.years} onChange={(e) => set('years', e.target.value)} />
          <div className="lbl">Languages</div><div className="chips">{[['en', 'English'], ['sw', 'Kiswahili']].map(([v, l]) => <Chip key={v} label={l} on={f.languages.includes(v)} onClick={() => set('languages', toggle(f.languages, v))} />)}</div>
        </> : null}
        {step === 3 ? <>
          <p>Certificates and licences are optional. They are what earn the “Qualification verified” badge, and some trades (e.g. electrical) require them to appear in licensed categories.</p>
          <div className="field"><label htmlFor="docs">Upload certificates, licences, training records</label><input id="docs" type="file" multiple accept="image/*,application/pdf" onChange={(e) => setDocs(Array.from(e.target.files ?? []))} /><span className="hint">{docs.length} file(s) selected</span></div>
        </> : null}
        {step === 4 ? <>
          <div className="chips" role="group" aria-label="Account type"><Chip label="Individual" on={f.accountType === 'individual'} onClick={() => set('accountType', 'individual')} /><Chip label="Registered business" on={f.accountType === 'business'} onClick={() => set('accountType', 'business')} /></div>
          {f.accountType === 'business' ? <><TextField label="Business name" value={f.businessName} onChange={(e) => set('businessName', e.target.value)} /><TextField label="Registration number" value={f.regNo} onChange={(e) => set('regNo', e.target.value)} /><p className="small muted">You can invite technicians and assign jobs after approval.</p></> : null}
        </> : null}
        {step === 5 ? <>
          <div className="grid g2"><TextField label="Free travel radius (km)" inputMode="decimal" value={f.freeRadius} onChange={(e) => set('freeRadius', e.target.value)} /><TextField label="Maximum travel (km)" inputMode="decimal" value={f.maxTravel} onChange={(e) => set('maxTravel', e.target.value)} /><TextField label="Per-km charge beyond free radius (KSh)" inputMode="decimal" value={f.perKm} onChange={(e) => set('perKm', e.target.value)} /><TextField label="Minimum call-out fee (KSh)" inputMode="decimal" value={f.minCallOut} onChange={(e) => set('minCallOut', e.target.value)} /></div>
          <Check label="I accept urgent / emergency jobs" checked={f.emergency} onChange={(e) => set('emergency', e.target.checked)} />
          <Check label="Auto-accept bookings that fit my availability" checked={f.autoAccept} onChange={(e) => set('autoAccept', e.target.checked)} />
          <p className="small muted">Add your services and prices right after submitting.</p>
        </> : null}
        {step === 6 ? <><TextArea label="Estates / neighbourhoods you serve (comma separated)" hint={`In ${f.county}. Your county is always included.`} value={f.areas} onChange={(e) => set('areas', e.target.value)} /></> : null}
        {step === 7 ? <>
          <div className="lbl">Working days</div><div className="chips">{DAYS.map((d, i) => <Chip key={d} label={d} on={f.days.includes(i)} onClick={() => set('days', toggle(f.days, i))} />)}</div>
          <div className="grid g2"><TextField label="Start" type="time" value={f.start} onChange={(e) => set('start', e.target.value)} /><TextField label="End" type="time" value={f.end} onChange={(e) => set('end', e.target.value)} /></div>
        </> : null}
        {step === 8 ? <>
          <p className="small muted">Optional now; required before your first payout. The account name must match your identity.</p>
          <Select label="Type" value={f.payKind} onChange={(e) => { set('payKind', e.target.value as any); set('payProvider', e.target.value === 'bank' ? '' : 'M-Pesa'); }} options={[{ value: 'mobile_money', label: 'Mobile money' }, { value: 'bank', label: 'Bank' }]} />
          <TextField label={f.payKind === 'bank' ? 'Bank name' : 'Provider'} value={f.payProvider} onChange={(e) => set('payProvider', e.target.value)} />
          <TextField label={f.payKind === 'bank' ? 'Account number' : 'Phone number'} value={f.payRef} onChange={(e) => set('payRef', e.target.value)} />
          <TextField label="Account name" value={f.payName} onChange={(e) => set('payName', e.target.value)} />
        </> : null}
        {step === 9 ? <>
          <ul><li><strong>{f.displayName}</strong> ({f.accountType}){f.businessName ? ` · ${f.businessName}` : ''}</li><li>{f.county}{f.area ? `, ${f.area}` : ''}</li><li>{f.categoryIds.length} categor{f.categoryIds.length === 1 ? 'y' : 'ies'}</li><li>Travel up to {f.maxTravel} km · {f.emergency ? 'urgent jobs on' : 'no urgent jobs'}</li><li>{f.days.map((d) => DAYS[d]).join(', ')} {f.start}–{f.end}</li><li>{docs.length} document(s)</li></ul>
          <p className="small muted">Your profile goes to our verification queue. Basic identity and safety checks apply to everyone. There is no fee to register. Paying never buys ratings, verification or ranking.</p>
        </> : null}
      </Card>
      <div className="row" style={{ marginTop: 16 }}>
        {step > 0 ? <Button tone="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <Button tone="ghost" onClick={() => signOut().then(() => router.push('/'))}>Cancel</Button>}
        <span className="spacer" />
        {step < STEPS.length - 1 ? <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue</Button> : <Button loading={busy} onClick={submit}>Submit for review</Button>}
      </div>
    </div>
  );
}
