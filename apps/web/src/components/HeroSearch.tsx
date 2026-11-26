'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COUNTIES, COUNTIES_FEATURED, PLACES } from '@fundilink/sdk';
import { Button } from './ui';
import { getPosition } from '@/lib/hooks';
import { Icon } from './Icon';

export const PROBLEMS: { icon: 'droplet' | 'sparkles' | 'truck' | 'zap' | 'brush' | 'snowflake'; title: string; hint: string; nl: string }[] = [
  { icon: 'droplet', title: 'Leaking pipe?', hint: 'Plumbers who can come today', nl: 'I have a leaking pipe and need a plumber today' },
  { icon: 'sparkles', title: 'Need a deep clean?', hint: 'Homes, offices and move-outs', nl: 'I need a deep clean for my home' },
  { icon: 'truck', title: 'Moving house?', hint: 'Movers with transport included', nl: 'I need movers for moving house' },
  { icon: 'zap', title: 'Power problem?', hint: 'Licensed electricians', nl: 'I need an electrician for a power fault' },
  { icon: 'brush', title: 'Repainting?', hint: 'Compare quotes from painters', nl: 'I need a painter for a three-bedroom apartment' },
  { icon: 'snowflake', title: 'Fridge or AC broken?', hint: 'Appliance repair near you', nl: 'My fridge stopped cooling and I need a repair' },
];

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set('nl', q.trim());
    if (where === 'gps') {
      setBusy(true); setErr('');
      try { const g = await getPosition(); p.set('lat', String(g.lat)); p.set('lng', String(g.lng)); p.set('radiusKm', '10'); }
      catch (x: any) { setErr(x.message); setBusy(false); return; }
      setBusy(false);
    } else if (where) p.set('county', where);
    router.push(`/explore?${p}`);
  };
  return (
    <form onSubmit={go} aria-label="Search for a service">
      <div className="searchbox">
        <input aria-label="What service do you need?" placeholder="What do you need done? e.g. leaking kitchen sink in Kilimani" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Location" value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="">All of Kenya</option>
          <option value="gps">Near me (GPS)</option>
          <optgroup label="Popular">{COUNTIES_FEATURED.map((c) => <option key={`f${c}`} value={c}>{c}</option>)}</optgroup>
          <optgroup label="All counties">{COUNTIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
          <optgroup label="Towns & estates">{PLACES.filter((p) => !COUNTIES.some((c) => c.name === p.name)).map((p) => <option key={`${p.name}${p.county}`} value={p.name}>{p.name} ({p.county})</option>)}</optgroup>
        </select>
        <Button type="submit" loading={busy}>Search</Button>
      </div>
      {err ? <p className="small" role="alert" style={{ color: 'var(--bad-fg)' }}>{err}</p> : null}
      <div className="suggest" aria-label="Common problems">
        {PROBLEMS.slice(0, 4).map((x) => <button key={x.title} type="button" className="chip" onClick={() => router.push(`/explore?nl=${encodeURIComponent(x.nl)}`)}>{x.title}</button>)}
      </div>
      <div className="row wrap-r" style={{ marginTop: 12 }}>
        <Button type="submit" small>Find professionals</Button>
        <a className="btn sm ghost" href="/app/quotations/new">Request quotations</a>
        <a className="btn sm danger" href="/emergency"><Icon name="alertCircle" size={16} /> Urgent help</a>
      </div>
    </form>
  );
}
