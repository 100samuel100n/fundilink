'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LatLng, LivePosition } from '@fundilink/sdk';
import {
  KENYA_CENTER, simulateDrive, acceptGpsFix, ageLabel, buildTimeline, deriveStage, describeEta, freshnessLabel, journeyMessage, locationFreshness, navigationUrl,
  type GpsFix,
} from '@fundilink/sdk';
import { saveSimPos, useProviders } from '@/lib/demo';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { MapLazy } from './MapLazy';
import { Icon } from './Icon';
import { Async, Button, Card, StatusBadge } from './ui';

const startOf = (range?: string) => { const m = range?.match(/(\d{4}-\d{2}-\d{2}[ T][\d:.]+(?:[+-]\d{2}(?::?\d{2})?|Z)?)/); return m ? new Date(m[1].replace(' ', 'T')).getTime() : null; };
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : null);

/**
 * Enroute: a full arrival experience, not a dot on a map.
 * Customer: stage, honest freshness, ETA window, timeline. Professional: the same states plus navigation hand-off and GPS sharing.
 * Real-time over the socket, with polling as a fallback whenever the socket goes quiet.
 */
export function TrackView({ id, side, back }: { id: string; side: 'customer' | 'professional'; back: string }) {
  const j = useAsync(() => api.journey(id), [id]);
  const b = useAsync(() => api.booking(id), [id]);
  const [pos, setPos] = useState<LivePosition | null>(null);
  const [fixAt, setFixAt] = useState<number | null>(null);
  const [trail, setTrail] = useState<LatLng[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [sharing, setSharing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [full, setFull] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { demo } = useProviders();
  const [simOn, setSimOn] = useState(false);
  const [simPct, setSimPct] = useState(0);
  const simStop = useRef<null | (() => void)>(null);
  const live = ['en_route', 'arrived'].includes(status ?? b.data?.status ?? '');

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!full) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [full]);

  // real-time updates (customer)
  useEffect(() => {
    if (side !== 'customer') return;
    let stop: (() => void) | undefined; let dead = false;
    api.watchJourney(id, {
      onReady: (i) => { if (i.last) setTrail((t) => (t.length ? t : [i.last!])); if (i.status) setStatus(i.status); },
      onPosition: (p) => { setPos(p); setFixAt(p.at || Date.now()); setTrail((t) => [...t.slice(-200), { lat: p.lat, lng: p.lng }]); },
      onStatus: (s) => { setStatus(s); b.refresh(); },
    }).then((u) => { if (dead) u(); else stop = u; }).catch((e) => setErr(errMsg(e)));
    return () => { dead = true; stop?.(); };
  }, [id, side, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  // fallback polling: keeps ETA, route and status fresh if the socket drops or is blocked
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { j.refresh(); b.refresh(); }, 20_000);
    return () => clearInterval(t);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  // professional: share GPS only while en route or arrived, filtered for drift
  const watch = useRef<number | null>(null);
  useEffect(() => {
    if (side !== 'professional' || !['en_route', 'arrived'].includes(status ?? b.data?.status ?? '') || demo) return;
    let tx: Awaited<ReturnType<typeof api.broadcastPosition>> | null = null; let dead = false; let last = 0; let prev: GpsFix | null = null;
    api.broadcastPosition(id).then((t) => {
      if (dead) return t.stop();
      tx = t; setSharing(true); setErr('');
      watch.current = navigator.geolocation.watchPosition((p) => {
        const at = Date.now(); if (at - last < 4000) return;
        const fix: GpsFix = { lat: p.coords.latitude, lng: p.coords.longitude, at, accuracyM: p.coords.accuracy };
        if (!acceptGpsFix(prev, fix)) return; // drops inaccurate or teleporting fixes
        last = at; prev = fix;
        tx!.send({ lat: fix.lat, lng: fix.lng, heading: p.coords.heading ?? undefined, speedKmh: p.coords.speed != null ? p.coords.speed * 3.6 : undefined });
        setPos({ lat: fix.lat, lng: fix.lng, heading: p.coords.heading, speedKmh: p.coords.speed != null ? p.coords.speed * 3.6 : null, remainingKm: 0, etaMinutes: 0, nearby: false, at });
        setFixAt(at); setTrail((tr) => [...tr.slice(-200), { lat: fix.lat, lng: fix.lng }]);
      }, (e) => { setErr(e.code === 1 ? 'Location permission is off. Allow location for this site, then restart sharing.' : e.message); setSharing(false); }, { enableHighAccuracy: true, maximumAge: 2000 });
    }).catch((e) => setErr(errMsg(e)));
    return () => { dead = true; if (watch.current != null) navigator.geolocation.clearWatch(watch.current); tx?.stop(); setSharing(false); };
  }, [id, side, status, b.data?.status, demo, retry]);

  const startSim = async () => {
    setErr('');
    try {
      const plan = await api.demoJourneyPlan(id);
      const tx = await api.broadcastPosition(id);
      setSimOn(true); setSharing(true);
      const h = simulateDrive(plan.route, {
        onFix: (f) => {
          tx.send({ lat: f.lat, lng: f.lng, heading: f.heading, speedKmh: f.speedKmh }); saveSimPos(id, f);
          setPos({ lat: f.lat, lng: f.lng, heading: f.heading, speedKmh: f.speedKmh, remainingKm: 0, etaMinutes: 0, nearby: false, at: Date.now() }); setFixAt(Date.now());
          setTrail((t) => [...t.slice(-200), { lat: f.lat, lng: f.lng }]); setSimPct(Math.round((f.index / (f.total - 1)) * 100));
        },
        onDone: () => { setSimOn(false); setSharing(false); setTimeout(() => tx.stop(), 1500); },
      });
      simStop.current = () => { h.stop(); tx.stop(); setSimOn(false); setSharing(false); };
    } catch (e) { setErr(errMsg(e)); }
  };
  useEffect(() => () => simStop.current?.(), []);

  const st = status ?? b.data?.status ?? '';
  const eta = pos?.etaMinutes || j.data?.etaMinutes || null;
  const stage = deriveStage({ status: st, startsAt: startOf(b.data?.scheduled_during), etaMinutes: eta, remainingKm: pos?.remainingKm, nearby: pos?.nearby, now });
  const here: LatLng | null = pos ? { lat: pos.lat, lng: pos.lng } : trail.at(-1) ?? null;
  // A position we hold but cannot date (first snapshot) is shown as last known, never as live.
  const fresh = here ? (fixAt == null ? 'stale' as const : locationFreshness(fixAt, now)) : 'none' as const;
  const est = useMemo(() => describeEta({ etaMinutes: eta, fixAt, speedKmh: pos?.speedKmh, now }), [eta, fixAt, pos?.speedKmh, now]);
  const timeline = buildTimeline(stage, b.data?.history ?? []);
  const dest = j.data?.destination ?? (b.data?.lat != null ? { lat: Number(b.data.lat), lng: Number(b.data.lng) } : null);
  const arrived = stage === 'arrived';

  return (
    <div className="stack">
      <div className="row between wrap-r"><Link href={back} className="row-ic"><Icon name="arrowRight" size={16} className="flip" />Booking</Link>{b.data ? <StatusBadge status={st || b.data.status} /> : null}</div>
      <Async state={j}>{(jr) => (
        <div className="enroute">
          <div className={full ? 'mapwrap full' : 'mapwrap'}>
            <button className="btn sm ghost fs" style={{ background: 'var(--surface)' }} onClick={() => setFull(!full)} aria-label={full ? 'Exit full screen map' : 'Full screen map'}><Icon name={full ? 'minimize' : 'maximize'} size={16} />{full ? 'Close' : 'Full screen'}</button>
            <MapLazy className="mapbox tall" center={here ?? dest ?? KENYA_CENTER} route={jr.plannedRoute} trail={trail.length > 1 ? trail : jr.trail} live={here} stale={fresh === 'stale' || fresh === 'none'}
              fitKey={`${full}-${here ? 1 : 0}-${stage}`}
              markers={dest ? [{ id: 'dest', ...dest, label: side === 'customer' ? 'Your location' : 'Customer', kind: 'dest' }] : []} />
          </div>

          <div className="stack">
            <Card>
              <div className="row between wrap-r" style={{ marginBottom: 8 }}>
                <span className={`fresh ${fresh}`}><i />{freshnessLabel(fresh)}</span>
                <span className="muted small">{ageLabel(fixAt, now)}</span>
              </div>
              <h2 style={{ fontSize: '1.2rem', margin: '0 0 8px' }}>{journeyMessage(stage, side, { etaMinutes: est.minutes, fresh })}</h2>
              {['enroute', 'approaching'].includes(stage) ? (
                <>
                  <div className="eta">{fresh === 'stale' || fresh === 'none' ? 'Last known' : est.minutes ? est.label : 'Estimating'}</div>
                  <p className="muted small" style={{ margin: '6px 0 0' }}>
                    {pos?.remainingKm ? `${pos.remainingKm.toFixed(1)} km to go. ` : ''}
                    {est.confidence === 'high' ? 'Based on live road routing.' : est.stopped ? 'Your professional appears to be stopped, so this estimate may change.' : 'Estimate is less certain right now. It updates as new locations arrive.'}
                  </p>
                </>
              ) : null}
              {arrived ? <p style={{ marginBottom: 0 }}>{side === 'customer' ? 'Check your notifications for the start PIN. Share it only when they are at your door.' : 'Ask the customer for their start PIN on the booking page.'}</p> : null}
              {!jr.active && !pos && !arrived && stage !== 'working' && stage !== 'completed' && stage !== 'cancelled' ? <p className="muted small" style={{ marginBottom: 0 }}>Live tracking starts when the professional begins the journey.</p> : null}
              {fresh === 'stale' && live ? <div className="banner" style={{ marginTop: 10 }}>Signal is weak on their side. We are showing the last known position and will update it as soon as it returns.</div> : null}
            </Card>

            <Card>
              <h3 style={{ marginBottom: 12 }}>Journey</h3>
              <ol className="stepper">
                {timeline.map((t) => (
                  <li key={t.stage} className={t.state}>
                    <span className="dot">{t.state === 'done' ? <Icon name="check" size={13} stroke={3} /> : null}</span>
                    <div><b>{t.label}</b><small>{[fmtTime(t.at), t.actor && t.at ? `by ${t.actor}` : null].filter(Boolean).join(' · ')}</small></div>
                  </li>
                ))}
              </ol>
            </Card>

            {side === 'professional' ? (
              <Card>
                <h3 style={{ marginBottom: 8 }}>Your journey</h3>
                <p className="small muted" style={{ margin: '0 0 10px' }}>{sharing ? 'Sharing your live location with the customer.' : 'Location sharing is off.'} Sharing stops automatically when the job starts.</p>
                <div className="row wrap-r" style={{ gap: 8 }}>
                  {dest ? <a className="btn sm" href={navigationUrl(dest)} target="_blank" rel="noopener noreferrer"><Icon name="navigation" size={16} />Open navigation</a> : null}
                  <Link className="btn sm secondary" href={back}><Icon name="message" size={16} />Contact customer</Link>
                  {live ? <Button small tone="ghost" onClick={() => setRetry((n) => n + 1)}>Restart sharing</Button> : null}
                </div>
                <p className="small muted" style={{ margin: '10px 0 0' }}>Delayed or GPS not working? Message the customer from the booking page so they know, then mark arrived when you reach them.</p>
              </Card>
            ) : (
              <Card className="flat"><p className="small muted" style={{ margin: 0 }}>Estimated arrival is not a guarantee. Live location is shared only during this journey and stops when the job starts.</p></Card>
            )}

            {side === 'professional' && demo && st === 'en_route' ? (
              <Card className="demo">
                <strong>Demo drive simulator</strong>
                <p className="small muted">Drives the road route to the customer in about a minute. Open the customer’s tracking page (another browser or the mobile app) to watch it move. When the bar reaches 100%, go back to the booking and tap “I’ve arrived”.</p>
                <div className="progress" style={{ margin: '8px 0' }}><i style={{ width: `${simPct}%` }} /></div>
                {simOn ? <Button tone="danger" onClick={() => simStop.current?.()}>Stop</Button> : <Button onClick={startSim}>{simPct >= 100 ? 'Drive again' : 'Start driving'}</Button>}
              </Card>
            ) : null}
            {err ? <p role="alert" style={{ color: 'var(--bad-fg)' }}>{err}</p> : null}
          </div>
        </div>
      )}</Async>
    </div>
  );
}
