'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { errMsg, getPosition, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Icon } from '@/components/Icon';
import { Button, Card, Chip, PageTitle, Select, TextArea, TextField } from '@/components/ui';

const FREQ = [['weekly', 'Weekly'], ['fortnightly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TERMS = [['3 months', '3 months'], ['6 months', '6 months'], ['12 months', '12 months'], ['ongoing until cancelled', 'Ongoing']] as const;
const IDEAS = ['Office cleaning', 'Pest control visits', 'AC servicing', 'Garden maintenance', 'Electrical inspection', 'Property upkeep'];

/**
 * Recurring service request. It goes out as a quotation request with the schedule spelled out, so professionals can quote a
 * repeat arrangement. Customers compare, accept and pay as with any quotation; the agreed schedule appears in the project.
 */
export default function Page() {
  const router = useRouter(); const t = useToast();
  const cats = useAsync(() => api.categories());
  const [freq, setFreq] = useState<(typeof FREQ)[number][0]>('weekly');
  const [day, setDay] = useState('Monday'); const [time, setTime] = useState('morning'); const [term, setTerm] = useState<string>('6 months');
  const [start, setStart] = useState(''); const [cat, setCat] = useState(''); const [address, setAddress] = useState(''); const [notes, setNotes] = useState(''); const [budget, setBudget] = useState('');
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null); const [busy, setBusy] = useState(false);
  const catId = cat || String(cats.data?.[0]?.id ?? '');
  const catName = cats.data?.find((c) => String(c.id) === catId)?.name ?? 'service';
  const freqLabel = FREQ.find((f) => f[0] === freq)![1];

  const submit = async () => {
    setBusy(true);
    try {
      const scope = [
        'RECURRING SERVICE REQUEST',
        `Frequency: ${freqLabel.toLowerCase()}`,
        `Preferred day and time: ${day}${freq === 'weekly' || freq === 'fortnightly' ? 's' : ''}, ${time}`,
        `Start date: ${start || 'as soon as possible'}`,
        `Contract length: ${term}`,
        budget ? `Budget per visit: KSh ${budget}` : null,
        '', notes,
        '', 'Please quote a price per visit, what is included, and your cancellation terms.',
      ].filter((x) => x !== null).join('\n');
      const r: any = await api.createProject({ title: `${freqLabel} ${catName.toLowerCase()}`, scope, address, lat: pt!.lat, lng: pt!.lng, budget: budget ? Math.round(Number(budget) * 100) : undefined, categoryId: Number(catId) });
      t.ok(`Sent to ${r.invited ?? 'nearby'} professionals`); router.push(`/app/quotations/${r.project?.id ?? ''}`);
    } catch (e) { t.err(errMsg(e)); setBusy(false); }
  };

  return (
    <div className="narrow">
      <PageTitle title="Recurring services" sub="Weekly cleaning, monthly pest control, quarterly servicing. Professionals quote a repeat arrangement and you compare." />
      <div className="chips" style={{ marginBottom: 16 }}>{IDEAS.map((i) => <span className="chip" key={i}><Icon name="repeat" size={14} /> {i}</span>)}</div>
      <Card>
        <Select label="Service" value={catId} onChange={(e) => setCat(e.target.value)} options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <div className="field"><label>How often</label><div className="chips">{FREQ.map(([v, l]) => <Chip key={v} label={l} on={freq === v} onClick={() => setFreq(v)} />)}</div></div>
        <div className="grid g2"><Select label="Preferred day" value={day} onChange={(e) => setDay(e.target.value)} options={DAYS.map((d) => ({ value: d, label: d }))} />
          <Select label="Time of day" value={time} onChange={(e) => setTime(e.target.value)} options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]} /></div>
        <div className="grid g2"><TextField label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} /><Select label="Contract length" value={term} onChange={(e) => setTerm(e.target.value)} options={TERMS.map(([v, l]) => ({ value: v, label: l }))} /></div>
        <TextField label="Site address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="row wrap-r"><Button tone="secondary" onClick={async () => { try { setPt(await getPosition()); } catch (e) { t.err(errMsg(e)); } }}><Icon name="pin" size={16} /> Pin site location</Button><span className="muted small">{pt ? `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}` : 'Required'}</span></div>
        <TextField label="Budget per visit in KSh (optional)" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        <TextArea label="Anything the professional should know" hint="Size of the space, access, supplies, special requirements." value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button loading={busy} disabled={!address || !pt || !catId} onClick={submit}>Request quotations</Button>
        <p className="muted small" style={{ marginBottom: 0 }}>Reminders, renewals and automatic payments for accepted schedules are added as professionals start offering them. Today you can compare quotes, accept one and pay through the platform.</p>
      </Card>
    </div>
  );
}
