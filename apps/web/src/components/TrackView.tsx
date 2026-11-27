'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LatLng, LivePosition } from '@fundilink/sdk';
import {
  simulateDrive, acceptGpsFix, ageLabel, buildTimeline, deriveStage, describeEta, distanceKm, freshnessLabel, journeyMessage, locationFreshness, navigationUrl, nextActions,
  type GpsFix,
} from '@fundilink/sdk';
import { demoPosition, saveSimPos, useProviders } from '@/lib/demo';
import { api } from '@/lib/api';
import { errMsg, getPosition, useAsync, usePoll } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { TrackMapLazy, type CamMode } from './MapLazy';
import { Icon } from './Icon';
import { Button, ErrorState, StatusBadge } from './ui';
import { VEHICLES, guessVehicle, vehicleSvg, type Vehicle } from './vehicles';
import './track.css';

const startOf = (range?: string) => { const m = range?.match(/(\d{4}-\d{2}-\d{2}[ T][\d:.]+(?:[+-]\d{2}(?::?\d{2})?|Z)?)/); return m ? new Date(m[1].replace(' ', 'T')).getTime() : null; };
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
const fmtTime = (iso: string | null) => (iso ? clock(new Date(iso).getTime()) : null);
const km = (n: number) => (n < 1 ? `${Math.max(50, Math.round(n * 10) * 100)} m` : `${n.toFixed(1)} km`);

function useMedia(q: string) {
  const [m, set] = useState(false);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => set(mq.matches); on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [q]);
  return m;
}

function Glyph({ kind, h = 40 }: { kind: Vehicle; h?: number }) { return <span className="trk-glyph" dangerouslySetInnerHTML={{ __html: vehicleSvg(kind, h) }} />; }

/**
 * The live journey screen. Full screen, outside the portal chrome, one job: get the right person to the right door.
 * Customer: vehicle gliding along the road, honest ETA, start PIN. Professional: navigation, GPS sharing and every journey action
 * (start, arrived, start job) without leaving the screen. Realtime over the socket, polling as the fallback.
 */
export function TrackView({ id, side, back }: { id: string; side: 'customer' | 'professional'; back: string }) {
  const toast = useToast();
  const j = useAsync(() => api.journey(id), [id]);
  const b = useAsync(() => api.booking(id), [id]);
  const [pos, setPos] = useState<LivePosition | null>(null);
  const [fixAt, setFixAt] = useState<number | null>(null);
  const [trail, setTrail] = useState<LatLng[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [sharing, setSharing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { demo } = useProviders();
  const [simOn, setSimOn] = useState(false);
  const [simPct, setSimPct] = useState(0);
  const simStop = useRef<null | (() => void)>(null);
  const [mode, setMode] = useState<CamMode>('follow');
  const [recenter, setRecenter] = useState(0);
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle>('car');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [pin, setPin] = useState('');
  const wide = useMedia('(min-width: 900px)');
  const sheet = useRef<HTMLElement>(null);
  const [sheetH, setSheetH] = useState(240);
  const startKm = useRef(0);

  const st = status ?? b.data?.status ?? '';
  const live = ['en_route', 'arrived'].includes(st);

  /* ---------- full-screen chrome ---------- */
  useEffect(() => { document.documentElement.classList.add('tracking'); return () => document.documentElement.classList.remove('tracking'); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  useEffect(() => { // vehicle: a pro's own choice is remembered, customers see what the API reports, else a sensible default
    const given = (b.data as unknown as { vehicle?: string; category?: string } | undefined);
    let saved: string | null = null; try { saved = localStorage.getItem('fl.vehicle'); } catch { /* ignore */ }
    const v = (side === 'professional' && saved ? saved : given?.vehicle ?? given?.category ?? null);
    setVehicle(VEHICLES.some((x) => x.id === v) ? (v as Vehicle) : guessVehicle(v));
  }, [side, b.data]);
  const pickVehicle = (v: Vehicle) => { setVehicle(v); try { localStorage.setItem('fl.vehicle', v); } catch { /* ignore */ } };

  useEffect(() => { // keep the map's camera padding in step with the sheet
    const e = sheet.current; if (!e) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => setSheetH(Math.round(e.getBoundingClientRect().height / 8) * 8), 120); });
    ro.observe(e); return () => { ro.disconnect(); clearTimeout(t); };
  }, []);

  /* ---------- realtime (customer) ---------- */
  useEffect(() => {
    if (side !== 'customer') return;
    let stop: (() => void) | undefined; let dead = false;
    api.watchJourney(id, {
      onReady: (i) => { if (i.last) setTrail((t) => (t.length ? t : [i.last!])); if (i.status) setStatus(i.status); },
      onPosition: (p) => { setPos(p); setFixAt(p.at || Date.now()); setTrail((t) => [...t.slice(-200), { lat: p.lat, lng: p.lng }]); },
      onStatus: (s) => { setStatus(s); b.refresh(); j.refresh(); },
    }).then((u) => { if (dead) u(); else stop = u; }).catch((e) => setErr(errMsg(e)));
    return () => { dead = true; stop?.(); };
  }, [id, side, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  usePoll(() => { j.refresh(); b.refresh(); }, 20_000, live); // fallback when the socket drops or is blocked

  /* ---------- GPS sharing (professional, only while en route / arrived) ---------- */
  const watch = useRef<number | null>(null);
  useEffect(() => {
    if (side !== 'professional' || !['en_route', 'arrived'].includes(st) || demo) return;
    let tx: Awaited<ReturnType<typeof api.broadcastPosition>> | null = null; let dead = false; let last = 0; let prev: GpsFix | null = null;
    api.broadcastPosition(id).then((t) => {
      if (dead) return t.stop();
      tx = t; setSharing(true); setErr('');
      watch.current = navigator.geolocation.watchPosition((p) => {
        const at = Date.now(); if (at - last < 3000) return;
        const fix: GpsFix = { lat: p.coords.latitude, lng: p.coords.longitude, at, accuracyM: p.coords.accuracy };
        if (!acceptGpsFix(prev, fix)) return;
        last = at; prev = fix;
        const sp = p.coords.speed != null ? p.coords.speed * 3.6 : undefined;
        tx!.send({ lat: fix.lat, lng: fix.lng, heading: p.coords.heading ?? undefined, speedKmh: sp });
        setPos({ lat: fix.lat, lng: fix.lng, heading: p.coords.heading, speedKmh: sp ?? null, remainingKm: 0, etaMinutes: 0, nearby: false, at });
        setFixAt(at); setTrail((tr) => [...tr.slice(-200), { lat: fix.lat, lng: fix.lng }]);
      }, (e) => { setErr(e.code === 1 ? 'Location permission is off. Allow location for this site, then restart sharing.' : e.message); setSharing(false); }, { enableHighAccuracy: true, maximumAge: 2000 });
    }).catch((e) => setErr(errMsg(e)));
    return () => { dead = true; if (watch.current != null) navigator.geolocation.clearWatch(watch.current); tx?.stop(); setSharing(false); };
  }, [id, side, st, demo, retry]);

  /* ---------- demo drive ---------- */
  const startSim = async () => {
    setErr('');
    try {
      const plan = await api.demoJourneyPlan(id);
      const tx = await api.broadcastPosition(id);
      setSimOn(true); setSharing(true); setMode('follow');
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

  /* ---------- derived journey state ---------- */
  const dest = j.data?.destination ?? (b.data?.lat != null ? { lat: Number(b.data.lat), lng: Number(b.data.lng) } : null);
  const here: LatLng | null = pos ? { lat: pos.lat, lng: pos.lng } : trail.at(-1) ?? null;
  const straightKm = here && dest ? distanceKm(here, dest) : null;
  // the professional's own device has no server-side routing figures, so estimate from the road-ish distance
  const remKm = pos?.remainingKm || (straightKm != null ? straightKm * 1.25 : null);
  const eta = pos?.etaMinutes || j.data?.etaMinutes || (side === 'professional' && remKm != null ? Math.max(1, Math.round((remKm / 28) * 60)) : null);
  const stage = deriveStage({ status: st, startsAt: startOf(b.data?.scheduled_during), etaMinutes: eta, remainingKm: remKm, nearby: pos?.nearby, now });
  const fresh = here ? (fixAt == null ? 'stale' as const : locationFreshness(fixAt, now)) : 'none' as const;
  const est = useMemo(() => describeEta({ etaMinutes: eta, fixAt, speedKmh: pos?.speedKmh, now }), [eta, fixAt, pos?.speedKmh, now]);
  const timeline = buildTimeline(stage, b.data?.history ?? []);
  const arrived = stage === 'arrived';
  const moving = ['enroute', 'approaching'].includes(stage);
  const done = ['working', 'completed', 'cancelled'].includes(stage);
  const near = stage === 'approaching' || arrived;
  const stale = fresh === 'stale' || fresh === 'none';
  if (remKm && remKm > startKm.current) startKm.current = remKm;
  const pct = startKm.current && remKm != null ? clamp01(1 - remKm / startKm.current) : 0;
  const scheduled = startOf(b.data?.scheduled_during);

  // customer start PIN, delivered as a notification once the professional arrives
  const notes = useAsync(() => (side === 'customer' ? api.notifications() : Promise.resolve([])), [id, side]);
  usePoll(() => notes.refresh(), 10_000, side === 'customer' && arrived);
  const pinNote = (notes.data ?? []).find((n: any) => !n.read_at && n.template === 'arrival_pin' && (n.data?.bookingId === id || n.data?.ref));

  /* ---------- moments: stage changes buzz the phone and show a banner ---------- */
  const prevStage = useRef<string | null>(null);
  useEffect(() => {
    if (prevStage.current && prevStage.current !== stage) {
      const msg = journeyMessage(stage, side, { etaMinutes: est.minutes, fresh }); setNotice(msg);
      if (['approaching', 'arrived'].includes(stage)) { try { navigator.vibrate?.([140, 70, 140]); } catch { /* ignore */ } }
      if (stage === 'arrived' || stage === 'enroute') setMode(stage === 'arrived' ? 'overview' : 'follow');
      const t = setTimeout(() => setNotice(null), 6000); prevStage.current = stage; return () => clearTimeout(t);
    }
    prevStage.current = stage;
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // tab title shows the ETA, like a ride app
    const old = document.title; if (moving && est.minutes && !stale) document.title = `${est.minutes} min · FundiLink`;
    return () => { document.title = old; };
  }, [moving, est.minutes, stale]);

  /* ---------- actions (professional can run the whole journey from here) ---------- */
  const actions = side === 'professional' ? nextActions(st, 'professional').filter((a) => ['en_route', 'arrived', 'in_progress'].includes(a.to)) : [];
  const run = useCallback(async (to: string, needs?: string) => {
    setBusy(to); setErr('');
    try {
      const extra: Record<string, unknown> = {};
      if (needs === 'gps') { const g = (await demoPosition(id, to === 'en_route' ? 'start' : 'current')) ?? (await getPosition()); extra.lat = g.lat; extra.lng = g.lng; }
      if (needs === 'pin') extra.pin = pin;
      await api.transition(id, to as never, extra as never);
      setStatus(to); setPin(''); b.refresh(); j.refresh(); if (to === 'en_route') { setMode('follow'); setRetry((n) => n + 1); }
      if (to === 'in_progress') window.setTimeout(() => { window.location.href = back; }, 900);
    } catch (e) { toast.err(errMsg(e)); }
    setBusy('');
  }, [id, pin, back]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- map padding so the vehicle sits in the visible part of the map ---------- */
  const pad = wide ? { top: 90, bottom: 60, left: 450, right: 60 } : { top: 110, bottom: Math.min(sheetH, 520) + 36, left: 36, right: 36 };

  /* ---------- sheet drag ---------- */
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, moved: false }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dy = e.clientY - d.y; if (Math.abs(dy) > 24) { d.moved = true; setOpen(dy < 0); d.y = e.clientY; } };
  const onUp = () => { const d = drag.current; drag.current = null; if (d && !d.moved) setOpen((o) => !o); };

  const headline = journeyMessage(stage, side, { etaMinutes: est.minutes, fresh });
  const youLabel = side === 'customer' ? 'You' : 'Customer';
  const mapDest = dest;
  const nav = dest ? navigationUrl(dest) : null;
  const bigEta = stale && moving ? 'Last known' : est.minutes ? `${est.minutes}` : null;

  if (j.error && !j.data && !b.data) {
    return <div className="trk trk-center"><div className="trk-card"><ErrorState error={j.error} onRetry={() => { j.reload(); b.reload(); }} /><Link href={back} className="btn secondary" style={{ marginTop: 12 }}>Back to booking</Link></div></div>;
  }

  return (
    <div className="trk" style={{ ['--sheet-h' as string]: `${sheetH}px` }}>
      <TrackMapLazy
        route={j.data?.plannedRoute} trail={trail.length > 1 ? trail : j.data?.trail} live={here} heading={pos?.heading ?? null} speedKmh={pos?.speedKmh ?? null}
        dest={mapDest} destLabel={youLabel} destBubble={moving && est.minutes && !stale ? `${est.minutes} min` : null}
        vehicle={vehicle} stale={stale} arrived={arrived} near={near} mode={mode} onModeChange={setMode} pad={pad} recenterKey={recenter}
      />
      <div className="trk-vignette" aria-hidden="true" />

      {/* floating controls */}
      <header className="trk-top">
        <Link href={back} className="trk-fab" aria-label="Back to booking"><Icon name="arrowRight" size={20} className="flip" /></Link>
        <div className={`trk-pill ${fresh}`} role="status"><i />{live ? freshnessLabel(fresh) : b.data ? <StatusBadge status={st || b.data.status} /> : 'Loading'}{live && fixAt ? <span className="muted"> · {ageLabel(fixAt, now).replace('Updated ', '')}</span> : null}</div>
        <div className="trk-fabs">
          {mode !== 'follow' && here ? <button className="trk-fab" onClick={() => { setMode('follow'); setRecenter((n) => n + 1); }} aria-label="Follow vehicle" title="Follow"><Icon name="navigation" size={20} /></button> : null}
          <button className={`trk-fab${mode === 'overview' ? ' on' : ''}`} onClick={() => { setMode('overview'); setRecenter((n) => n + 1); }} aria-label="Show whole trip" title="Whole trip"><Icon name="maximize" size={19} /></button>
        </div>
      </header>
      {notice ? <div className="trk-notice" role="alert"><Icon name="bell" size={16} />{notice}</div> : null}

      {/* trip sheet */}
      <section ref={sheet} className={`trk-sheet${open ? ' open' : ''}`} aria-label="Trip details">
        <div className="trk-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" tabIndex={0} aria-expanded={open} aria-label={open ? 'Collapse details' : 'Expand details'}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}><i /></div>

        <div className="trk-head">
          <Glyph kind={vehicle} h={moving || arrived ? 46 : 38} />
          <div className="trk-main">
            <p className="trk-kick">{headline}</p>
            {moving ? (
              <div className="trk-eta">
                {bigEta ? <><b>{bigEta}</b>{!stale && est.minutes ? <span>min</span> : null}</> : <b className="est">Estimating…</b>}
                {est.minutes && !stale ? <small>Arrives {clock(now + est.minutes * 60_000)}{remKm != null ? ` · ${km(remKm)}` : ''}</small> : null}
              </div>
            ) : arrived ? <div className="trk-eta"><b className="est">{side === 'customer' ? 'They are here' : 'You have arrived'}</b></div>
              : !done && scheduled ? <div className="trk-eta"><b className="est">{clock(scheduled)}</b><small>Scheduled start</small></div> : null}
          </div>
        </div>

        {moving ? (
          <div className="trk-bar" aria-label={`Journey ${Math.round(pct * 100)}% complete`}><i style={{ width: `${Math.max(4, pct * 100)}%` }} /><span style={{ left: `${Math.max(2, pct * 100)}%` }}><Glyph kind={vehicle} h={20} /></span></div>
        ) : null}

        {arrived && side === 'customer' ? (
          <div className="trk-pin">{pinNote ? <><small>Your start PIN</small><b>{pinNote.data?.pin}</b><span>Share it only when they are at your door.</span></> : <><small>Start PIN</small><span>Your PIN appears here as soon as it is issued. Share it only at your door.</span></>}</div>
        ) : null}

        {stale && live ? <div className="trk-warn">{side === 'customer' ? 'Signal is weak on their side. Showing the last known position; it updates the moment it returns.' : 'We have no recent GPS from you. Check location permission, then restart sharing.'}</div> : null}
        {est.stopped && moving && !stale ? <div className="trk-warn soft">Stopped for now, so the arrival time may change.</div> : null}

        <div className="trk-cta">
          {actions.map((a, i) => (
            a.needs === 'pin' ? (
              <div key={a.to} className="trk-pinrow"><input inputMode="numeric" maxLength={4} placeholder="Customer’s 4-digit PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="Customer start PIN" />
                <Button loading={busy === a.to} disabled={pin.length !== 4} onClick={() => run(a.to, a.needs)}>Start job</Button></div>
            ) : <Button key={a.to} tone={i === 0 ? undefined : 'secondary'} block loading={busy === a.to} onClick={() => run(a.to, a.needs)}>{a.label}</Button>
          ))}
          {side === 'professional' && nav && (moving || stage === 'preparing' || stage === 'confirmed') ? <a className="btn secondary" href={nav} target="_blank" rel="noopener noreferrer"><Icon name="navigation" size={18} />Navigate</a> : null}
          {done ? <Link className="btn" href={back}>{stage === 'cancelled' ? 'Back to booking' : stage === 'completed' ? 'View summary' : 'Open job'}</Link> : <Link className="btn ghost" href={back}><Icon name="message" size={18} />{side === 'customer' ? 'Message' : 'Customer'}</Link>}
        </div>

        <div className="more">
          <div className="trk-meta">
            {b.data ? <div><small>Booking</small><b>{b.data.reference}</b></div> : null}
            {b.data?.address ? <div><small>{side === 'customer' ? 'Your address' : 'Destination'}</small><b>{b.data.address}</b></div> : null}
            {moving && remKm != null ? <div><small>Distance left</small><b>{km(remKm)}</b></div> : null}
            {pos?.speedKmh != null && moving ? <div><small>Speed</small><b>{Math.round(pos.speedKmh)} km/h</b></div> : null}
          </div>

          <h3 className="trk-h">Journey</h3>
          <ol className="stepper">
            {timeline.map((t) => (
              <li key={t.stage} className={t.state}>
                <span className="dot">{t.state === 'done' ? <Icon name="check" size={13} stroke={3} /> : null}</span>
                <div><b>{t.label}</b><small>{[fmtTime(t.at), t.actor && t.at ? `by ${t.actor}` : null].filter(Boolean).join(' · ')}</small></div>
              </li>
            ))}
          </ol>

          {side === 'professional' ? (
            <div className="trk-pro">
              <h3 className="trk-h">Your trip</h3>
              <p className="small muted" style={{ margin: '0 0 10px' }}>{sharing ? 'Sharing your live location with the customer.' : 'Location sharing is off.'} It stops automatically when the job starts.</p>
              <div className="trk-seg" role="radiogroup" aria-label="Vehicle shown to the customer">
                {VEHICLES.map((v) => <button key={v.id} role="radio" aria-checked={vehicle === v.id} className={vehicle === v.id ? 'on' : ''} onClick={() => pickVehicle(v.id)}><Glyph kind={v.id} h={30} /><span>{v.label}</span></button>)}
              </div>
              {live ? <Button small tone="ghost" onClick={() => setRetry((n) => n + 1)}>Restart sharing</Button> : null}
              <p className="small muted" style={{ margin: '10px 0 0' }}>Delayed or GPS not working? Message the customer from the booking page so they know, then tap “I’ve arrived” when you reach them.</p>
            </div>
          ) : <p className="small muted" style={{ margin: '14px 0 0' }}>Estimated arrival is not a guarantee. Live location is shared only during this journey and stops when the job starts.</p>}

          {side === 'professional' && demo && st === 'en_route' ? (
            <div className="trk-demo">
              <strong>Demo drive simulator</strong>
              <p className="small muted">Drives the road route to the customer in about a minute. Open the customer’s tracking page in another browser to watch it move, then tap “I’ve arrived”.</p>
              <div className="progress" style={{ margin: '8px 0' }}><i style={{ width: `${simPct}%` }} /></div>
              {simOn ? <Button tone="danger" onClick={() => simStop.current?.()}>Stop</Button> : <Button onClick={startSim}>{simPct >= 100 ? 'Drive again' : 'Start driving'}</Button>}
            </div>
          ) : null}
        </div>
        {err ? <p role="alert" className="trk-err">{err}</p> : null}
      </section>
    </div>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));