'use client';
import React, { useEffect, useState } from 'react';
import type { ProCard } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { getPosition } from '@/lib/hooks';
import { ProCardView } from './ProCard';
import { Button, Skeleton } from './ui';

export function NearbyPros() {
  const [pros, setPros] = useState<ProCard[] | null>(null);
  const [asked, setAsked] = useState(false);
  const [err, setErr] = useState('');
  const load = async () => {
    setAsked(true); setErr('');
    try { const g = await getPosition(); const r = await api.search({ lat: g.lat, lng: g.lng, radiusKm: 15, sort: 'nearest', limit: 4 }); setPros(r.results); }
    catch (e: any) { setErr(e.message); setAsked(false); }
  };
  useEffect(() => { navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((p) => { if (p.state === 'granted') load(); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (pros) return pros.length ? <div className="grid g2">{pros.map((p) => <ProCardView key={p.id} pro={p} />)}</div> : <p className="muted">No professionals within 15 km yet. <a href="/explore">Browse all Kenya</a>.</p>;
  if (asked) return <Skeleton h={130} n={2} />;
  return <div className="empty"><p className="muted">Share your location to see professionals close to you. We only use it for this search.</p><Button onClick={load}>Use my location</Button>{err ? <p className="small" role="alert" style={{ color: 'var(--bad-fg)' }}>{err}</p> : null}</div>;
}
