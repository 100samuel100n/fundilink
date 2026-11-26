'use client';
import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, PageTitle, TextField } from '@/components/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
type Day = { on: boolean; start: string; end: string };

export default function Availability() {
  const t = useToast();
  const q = useAsync(() => api.availability());
  const [days, setDays] = useState<Day[]>(DAYS.map(() => ({ on: false, start: '08:00', end: '17:00' })));
  const [saving, setSaving] = useState(false);
  const [off, setOff] = useState({ from: '', to: '', reason: '' });

  useEffect(() => {
    if (!q.data) return;
    const next = DAYS.map(() => ({ on: false, start: '08:00', end: '17:00' }));
    for (const w of q.data.weekly) next[w.weekday] = { on: true, start: w.start, end: w.end };
    setDays(next);
  }, [q.data]);

  const patch = (i: number, p: Partial<Day>) => setDays((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const invalid = days.some((d) => d.on && (!TIME.test(d.start) || !TIME.test(d.end) || d.end <= d.start));

  const save = async () => {
    setSaving(true);
    try { await api.setAvailability(days.flatMap((d, weekday) => (d.on ? [{ weekday, start: d.start, end: d.end }] : []))); t.ok('Working hours saved'); q.reload(); }
    catch (e) { t.err(errMsg(e)); } finally { setSaving(false); }
  };
  const addOff = async () => {
    const a = new Date(`${off.from}T00:00:00`), b = new Date(`${off.to || off.from}T23:59:59`);
    if (isNaN(+a) || isNaN(+b) || b <= a) return t.err('Choose valid dates');
    try { await api.addTimeOff({ startsAt: a.toISOString(), endsAt: b.toISOString(), reason: off.reason || undefined }); setOff({ from: '', to: '', reason: '' }); t.ok('Time off added'); q.reload(); }
    catch (e) { t.err(errMsg(e)); }
  };

  return (
    <>
      <PageTitle title="Availability" sub="Customers can only book you inside these hours. Overlapping bookings are blocked by the database, not just the calendar." />
      <Async state={q}>{(d) => (
        <div className="stack">
          <Card>
            <h3>Weekly hours</h3>
            {days.map((x, i) => (
              <div key={i} className="row" style={{ gap: 12, alignItems: 'center', padding: '6px 0' }}>
                <label style={{ width: 120 }}><input type="checkbox" checked={x.on} onChange={(e) => patch(i, { on: e.target.checked })} /> {DAYS[i]}</label>
                {x.on ? (<>
                  <TextField label="" aria-label={`${DAYS[i]} start`} value={x.start} onChange={(e) => patch(i, { start: e.target.value })} maxLength={5} style={{ width: 90 }} />
                  <span>to</span>
                  <TextField label="" aria-label={`${DAYS[i]} end`} value={x.end} onChange={(e) => patch(i, { end: e.target.value })} maxLength={5} style={{ width: 90 }} />
                </>) : <span className="muted small">Day off</span>}
              </div>
            ))}
            {invalid ? <p className="error" role="alert">Use 24-hour times like 08:00, and make each end time later than its start.</p> : null}
            <Button onClick={save} loading={saving} disabled={invalid}>Save working hours</Button>
          </Card>

          <Card>
            <h3>Booking rules</h3>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={d.autoAccept} onChange={async (e) => { try { await api.setPreferences({ autoAccept: e.target.checked }); q.reload(); } catch (x) { t.err(errMsg(x)); } }} /> Auto-accept bookings when I am free</label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={d.acceptsEmergency} onChange={async (e) => { try { await api.setPreferences({ acceptsEmergency: e.target.checked }); q.reload(); } catch (x) { t.err(errMsg(x)); } }} /> Receive urgent / emergency requests</label>
          </Card>

          <Card>
            <h3>Time off & blocked dates</h3>
            {d.timeOff.length === 0 ? <p className="muted small">No blocked dates.</p> : d.timeOff.map((o) => (
              <div key={o.id} className="row between" style={{ padding: '6px 0' }}>
                <span>{new Date(o.starts_at).toLocaleDateString('en-KE')} – {new Date(o.ends_at).toLocaleDateString('en-KE')}{o.reason ? ` · ${o.reason}` : ''}</span>
                <Button small tone="ghost" onClick={async () => { try { await api.removeTimeOff(o.id); q.reload(); } catch (e) { t.err(errMsg(e)); } }}>Remove</Button>
              </div>
            ))}
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <TextField label="From" type="date" value={off.from} onChange={(e) => setOff({ ...off, from: e.target.value })} />
              <TextField label="To (optional)" type="date" value={off.to} onChange={(e) => setOff({ ...off, to: e.target.value })} />
              <TextField label="Reason (optional)" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} />
              <Button tone="secondary" onClick={addOff} disabled={!off.from}>Block dates</Button>
            </div>
          </Card>
        </div>
      )}</Async>
    </>
  );
}
