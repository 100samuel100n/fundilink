'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Card, TextArea } from './ui';

const CATS = [['workQuality', 'Work quality'], ['professionalism', 'Professionalism'], ['punctuality', 'Punctuality'], ['valueForMoney', 'Value for money'], ['communication', 'Communication'], ['overall', 'Overall satisfaction']] as const;

function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="row between" role="radiogroup" aria-label={label} style={{ marginBottom: 8 }}>
      <span>{label}</span>
      <span>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: '1.6rem', color: n <= value ? 'var(--warn)' : 'var(--line)' }}>★</button>)}</span>
    </div>
  );
}

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const t = useToast();
  const [r, setR] = useState<Record<string, number>>({});
  const [body, setBody] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (done) return <Card><h3>Thank you for your review</h3></Card>;
  return (
    <Card><h3>Rate this job</h3>
      {CATS.map(([k, l]) => <StarInput key={k} label={l} value={r[k] ?? 0} onChange={(n) => setR({ ...r, [k]: n })} />)}
      <TextArea label="Your review (optional)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
      <Button loading={busy} disabled={!r.overall} onClick={async () => { setBusy(true); try { await api.review(bookingId, { overall: r.overall, workQuality: r.workQuality, professionalism: r.professionalism, punctuality: r.punctuality, valueForMoney: r.valueForMoney, communication: r.communication, body: body || undefined }); setDone(true); } catch (e) { t.err(errMsg(e)); } setBusy(false); }}>Submit review</Button>
    </Card>
  );
}
