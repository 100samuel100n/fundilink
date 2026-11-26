'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { COUNTY_CENTERS, type ProCard } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, getPosition } from '@/lib/hooks';
import { withoutSamples } from '@/lib/sample';
import { Icon, type IconName } from './Icon';
import { ProCardView } from './ProCard';
import { Button, Card, Select, Skeleton } from './ui';

type Kind = { id: string; label: string; icon: IconName; category: string; danger?: string };
const KINDS: Kind[] = [
  { id: 'pipe', label: 'Burst pipe or major leak', icon: 'droplet', category: 'plumbing', danger: 'If water is near electrics, switch off power at the mains only if it is safe to reach. Turn off the main water valve.' },
  { id: 'drain', label: 'Blocked drain or sewage', icon: 'droplet', category: 'plumbing' },
  { id: 'power', label: 'Power fault', icon: 'zap', category: 'electrical', danger: 'Sparking, burning smell or smoke: leave the building, do not touch wiring, and call 999 or 112 first.' },
  { id: 'lock', label: 'Locked out or broken lock', icon: 'key', category: 'security' },
  { id: 'cold', label: 'Fridge, freezer or AC failure', icon: 'snowflake', category: 'ac-refrigeration' },
  { id: 'gas', label: 'Gas smell or gas appliance', icon: 'flame', category: 'plumbing', danger: 'Do not use switches, flames or phones indoors. Open doors and windows, leave the building and call 999 or 112 first.' },
  { id: 'roof', label: 'Roof or structural damage', icon: 'home', category: 'roofing', danger: 'If there is any risk of collapse, keep everyone clear and call 999 or 112 first.' },
  { id: 'other', label: 'Something else', icon: 'toolbox', category: '' },
];

/** Separate from normal search: identify the emergency, say when to call responders first, capture location, then match urgent-ready pros. */
export function EmergencyFlow() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [county, setCounty] = useState('');
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<ProCard[] | null>(null);

  const search = async () => {
    setBusy(true); setErr('');
    try {
      const c = pt ?? (county ? COUNTY_CENTERS[county] : undefined);
      const r = await api.search({ category: kind?.category || undefined, availableNow: true, sort: c ? 'nearest' : 'earliest', lat: c?.lat, lng: c?.lng, radiusKm: c ? 25 : undefined, limit: 12 });
      setRes(withoutSamples(r.results).filter((p) => p.acceptsEmergency));
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><h1>Urgent help</h1><p className="muted" style={{ margin: 0 }}>Tell us what is happening and where. We only show professionals who are available now and accept urgent jobs.</p></div>

      <Card className="flat" style={{ borderColor: 'var(--bad)' }}>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}><span className="ico bad"><Icon name="phone" size={20} /></span>
          <div><strong>In danger? Call 999 or 112 first.</strong><p className="small muted" style={{ margin: '4px 0 0' }}>Fire, gas leaks, sparking wires, flooding near electrics or anything threatening life need the emergency services, not a marketplace.</p></div></div>
      </Card>

      <section aria-labelledby="k1">
        <h2 id="k1" style={{ fontSize: '1.2rem' }}>1. What is the problem?</h2>
        <div className="choice">{KINDS.map((k) => <button key={k.id} type="button" aria-pressed={kind?.id === k.id} onClick={() => { setKind(k); setRes(null); }}><span className="ico"><Icon name={k.icon} size={18} /></span>{k.label}</button>)}</div>
        {kind?.danger ? <div className="safety" style={{ marginTop: 12 }}><Icon name="alertCircle" size={22} /><div><strong>Safety first</strong>{kind.danger}</div></div> : null}
      </section>

      {kind ? (
        <section aria-labelledby="k2">
          <h2 id="k2" style={{ fontSize: '1.2rem' }}>2. Where are you?</h2>
          <Card>
            <div className="row wrap-r"><Button tone="secondary" onClick={async () => { try { setPt(await getPosition()); setErr(''); } catch (e) { setErr(errMsg(e)); } }}><Icon name="pin" size={16} /> Use my exact location</Button><span className="muted small">{pt ? 'Location captured' : 'or choose an area'}</span></div>
            <Select label="County or town" value={county} onChange={(e) => { setCounty(e.target.value); setPt(null); }} options={[{ value: '', label: 'Choose…' }, ...Object.keys(COUNTY_CENTERS).map((c) => ({ value: c, label: c }))]} />
            <Button loading={busy} disabled={!pt && !county} onClick={search}>Find professionals available now</Button>
            {err ? <p role="alert" className="small" style={{ color: 'var(--bad-fg)' }}>{err}</p> : null}
          </Card>
        </section>
      ) : null}

      {busy ? <Skeleton h={130} n={2} /> : null}
      {res ? (
        <section aria-labelledby="k3">
          <h2 id="k3" style={{ fontSize: '1.2rem' }}>3. Choose who to call out</h2>
          {res.length ? (
            <>
              <p className="muted small">Sorted by distance and availability. Urgent call-out charges are shown on the booking page before you pay. Nobody is confirmed until they accept.</p>
              <div className="stack">{res.map((p) => (
                <div key={p.id} className="stack" style={{ gap: 6 }}>
                  <ProCardView pro={p} urgent />
                </div>
              ))}</div>
              <p className="small muted" style={{ marginTop: 12 }}>Choose <strong>Book urgently</strong> to see the urgent call-out charge before you pay.</p>
            </>
          ) : (
            <Card className="flat"><strong>No urgent-ready professionals nearby right now.</strong><p className="muted small">You can widen the area, or post the job so professionals can respond as they become free.</p>
              <div className="row wrap-r"><Button tone="secondary" onClick={() => { setCounty(''); setPt(null); setRes(null); }}>Change location</Button><Link className="btn" href={`/app/quotations/new${kind?.category ? `?category=${kind.category}` : ''}`}>Post the job</Link></div></Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
