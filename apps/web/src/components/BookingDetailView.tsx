'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { kes, nextActions, timeAgo, type BookingDetail } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, getPosition, useAsync, usePoll } from '@/lib/hooks';
import { demoPosition, useProviders } from '@/lib/demo';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, StatusBadge, TextArea, TextField, Money } from './ui';
import { AddonCenter, AddonRequestForm, DirectPayCard, ModeBadge, MpesaSheet } from './payments';
import { ChatBox } from './ChatBox';
import { ReviewForm } from './ReviewForm';

/** Shared by the customer (/app/bookings/[id]) and professional (/professional/bookings/[id]) sites. */
export function BookingDetailView({ id, side, trackBase }: { id: string; side: 'customer' | 'professional'; trackBase: string }) {
  const st = useAsync(() => api.booking(id), [id]);
  usePoll(() => st.refresh(), 15000, true);
  return <Async state={st}>{(b) => <Inner b={b} side={side} reload={st.refresh} trackBase={trackBase} />}</Async>;
}

function Inner({ b, side, reload, trackBase }: { b: BookingDetail; side: 'customer' | 'professional'; reload: () => void; trackBase: string }) {
  const t = useToast();
  const { demo } = useProviders();
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState<{ to: string; label: string; needs?: string } | null>(null);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const mySide = b.side ?? side;
  const actions = nextActions(b.status, mySide);
  const live = ['en_route', 'arrived'].includes(b.status);

  const act = async (to: string, needs?: string) => {
    setBusy(to);
    try {
      const extra: any = {};
      if (needs === 'gps') { const g = (side === 'professional' ? await demoPosition(b.id, to === 'en_route' ? 'start' : 'current') : null) ?? (await getPosition()); extra.lat = g.lat; extra.lng = g.lng; }
      if (needs === 'pin') extra.pin = pin;
      if (needs === 'reason') extra.reason = reason;
      await api.transition(b.id, to as any, extra);
      t.ok('Updated'); setAsk(null); setReason(''); setPin(''); reload();
      if (to === 'en_route' && side === 'professional') location.href = `${trackBase}/${b.id}`;
    } catch (e) { t.err(errMsg(e)); }
    setBusy('');
  };

  return (
    <div className="split ps">
      <div className="stack" style={{ gap: 20 }}>
        <Card>
          <div className="row between wrap-r"><h1 style={{ fontSize: '1.5rem', margin: 0 }}>{b.reference}</h1><span className="row" style={{ gap: 6 }}><ModeBadge mode={b.payment_mode} /><StatusBadge status={b.status} /></span></div>
          <p>{b.description}</p>
          {b.address ? <p className="muted small">{b.address}</p> : null}
          {b.request_expires_at && b.status === 'awaiting_acceptance' ? <p className="small muted">Request expires {new Date(b.request_expires_at).toLocaleString('en-KE')}</p> : null}
        </Card>

        {mySide === 'customer' && b.status === 'pending_payment' && b.payment_mode !== 'direct' ? <PayPanel b={b} onPaid={reload} /> : null}
        {mySide === 'customer' ? <Alerts bookingId={b.id} /> : null}
        <AddonCenter b={b} side={mySide} onChange={reload} />
        {mySide === 'professional' && ['in_progress', 'arrived'].includes(b.status) ? <AddonRequestForm b={b} onSent={reload} /> : null}
        <DirectPayCard b={b} side={mySide} onChange={reload} />

        {demo && ['en_route', 'arrived', 'in_progress', 'awaiting_completion', 'completed'].includes(b.status) ? <Card className="demo"><strong>Demo mode</strong><p className="small muted">Replay the whole journey from the start.</p><Button tone="secondary" onClick={async () => { try { await api.demoResetBooking(b.id); t.ok('Booking reset to Scheduled'); reload(); } catch (e) { t.err(errMsg(e)); } }}>Reset this job</Button></Card> : null}
        {live ? <Card><h3>{mySide === 'customer' ? 'Your professional is on the way' : 'Share your journey'}</h3><p className="muted small">{mySide === 'customer' ? 'Watch them live on the map.' : 'Customer sees your live route while you travel. Sharing stops when the job ends.'}</p><Link className="btn" href={`${trackBase}/${b.id}`}>{mySide === 'customer' ? 'Track live' : 'Open navigation'}</Link></Card> : null}

        {actions.length ? (
          <Card>
            <h3>Actions</h3>
            <div className="row wrap-r">{actions.map((a) => (
              <Button key={a.to} tone={a.tone === 'danger' ? 'danger' : undefined} loading={busy === a.to} onClick={() => (a.needs === 'reason' || a.needs === 'pin' ? setAsk(a) : act(a.to, a.needs))}>{a.label}</Button>
            ))}</div>
            {ask ? (
              <div style={{ marginTop: 12 }}>
                {ask.needs === 'pin' ? <TextField label="Customer’s 4-digit start PIN" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} hint="The customer receives this PIN when you arrive." /> : <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />}
                <div className="row"><Button loading={busy === ask.to} disabled={ask.needs === 'pin' ? pin.length !== 4 : reason.trim().length < 3} onClick={() => act(ask.to, ask.needs)}>Confirm: {ask.label}</Button><Button tone="ghost" onClick={() => setAsk(null)}>Cancel</Button></div>
              </div>
            ) : null}
            {mySide === 'professional' && b.status === 'confirmed' ? <p className="small muted" style={{ marginBottom: 0 }}>“Start journey” asks for your location and shares it with the customer until the job ends.</p> : null}
          </Card>
        ) : null}

        {mySide === 'customer' && ['completed', 'settlement_pending', 'settled'].includes(b.status) ? <ReviewForm bookingId={b.id} /> : null}
        {['completed', 'settlement_pending', 'settled', 'cancelled', 'declined'].includes(b.status) && mySide === 'customer' && b.payment_mode !== 'direct' ? <RefundForm b={b} /> : null}
        {b.status !== 'draft' && b.status !== 'pending_payment' ? <Card><h3>Messages</h3><ChatBox bookingId={b.id} /></Card> : null}
      </div>

      <aside className="stack">
        <Card className="invoice">
          <h3>Price breakdown</h3>
          {b.items.map((i) => <div className="line" key={i.id}><span>{i.label} <span className="muted small">× {Number(i.quantity)}</span></span><span>{kes(Number(i.quantity) * Number(i.unit_amount))}</span></div>)}
          {Number(b.customer_fee) ? <div className="line muted"><span>Platform service fee</span><span>{kes(b.customer_fee)}</span></div> : null}
          {Number(b.tax) ? <div className="line muted"><span>Tax</span><span>{kes(b.tax)}</span></div> : null}
          <div className="line total"><span>Total</span><span>{kes(b.total)}</span></div>
          {mySide === 'professional' ? <p className="small muted" style={{ marginBottom: 0 }}>{b.payment_mode === 'direct' ? <>You collect <strong>{kes(b.total)}</strong> on site. Commission of <strong>{kes(b.commission)}</strong> comes from your wallet.</> : <>You receive <strong>{kes(b.professional_net)}</strong> after commission.</>}</p> : null}
          {b.payments?.length ? <div className="receipts">{b.payments.map((p) => <div className="line muted small" key={p.id}><span>{p.purpose === 'addon' ? 'Extra work' : 'Booking'} paid{p.receipt ? ` · ${p.receipt}` : ''}</span><span>{kes(p.amount)}</span></div>)}</div> : null}
        </Card>
        <Card><h3>History</h3>
          <ol className="timeline">{b.history.map((h) => <li key={h.id}><strong className="small">{h.to_status.replace(/_/g, ' ')}</strong> <span className="muted small">{timeAgo(h.created_at)}</span>{h.reason ? <div className="small muted">{h.reason}</div> : null}</li>)}</ol>
        </Card>
      </aside>
    </div>
  );
}

function PayPanel({ b, onPaid }: { b: BookingDetail; onPaid: () => void }) {
  return (
    <Card className="paycard">
      <MpesaSheet amount={b.total} start={(phone, key) => api.pay({ bookingId: b.id, method: 'mpesa', phone, idempotencyKey: key })} onDone={onPaid}
        note="Your money is held safely by FundiLink and released to the professional only after you confirm the work. Full refund if the job does not happen." />
    </Card>
  );
}

/** The arrival PIN arrives as a notification; extra-work requests are handled by AddonCenter. */
function Alerts({ bookingId }: { bookingId: string }) {
  const st = useAsync(() => api.notifications(), [bookingId]);
  usePoll(() => st.refresh(), 12000);
  const pin = (st.data ?? []).find((n) => !n.read_at && n.template === 'arrival_pin' && (n.data?.bookingId === bookingId || n.data?.ref));
  return pin ? <Card style={{ borderColor: 'var(--good)' }}><h3>Your start PIN: <span className="pin">{pin.data?.pin}</span></h3><p className="muted small" style={{ margin: 0 }}>Give this PIN to the professional only once they are at your door.</p></Card> : null;
}

function RefundForm({ b }: { b: BookingDetail }) {
  const t = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Number(b.total) / 100));
  const [reason, setReason] = useState('');
  if (!open) return <p className="small"><button className="btn sm ghost" onClick={() => setOpen(true)}>Request a refund</button></p>;
  return (
    <Card><h3>Request a refund</h3>
      <TextField label="Amount (KSh)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="row"><Button disabled={reason.trim().length < 5 || !Number(amount)} onClick={async () => { try { await api.requestRefund({ bookingId: b.id, amount: Math.round(Number(amount) * 100), reason }); t.ok('Refund requested. We will review it.'); setOpen(false); } catch (e) { t.err(errMsg(e)); } }}>Submit</Button><Button tone="ghost" onClick={() => setOpen(false)}>Cancel</Button></div></Card>
  );
}
export { Money };
