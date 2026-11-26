'use client';
import React, { useEffect, useState } from 'react';
import { COUNTY_CENTERS, KENYA_COUNTIES } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { AddressSearch } from '@/components/AddressSearch';
import { Button, Card, Select, TextField } from '@/components/ui';

const nearestCounty = (lat: number, lng: number) =>
  Object.entries(COUNTY_CENTERS).reduce((b, [k, c]: [string, any]) => {
    const d = (c.lat - lat) ** 2 + ((c.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    return d < b.d ? { k, d } : b;
  }, { k: '', d: Infinity }).k;

export function LocationCard() {
  const t = useToast();
  const me = useAsync(() => api.myProfile(), []);
  const p = me.data;
  const [f, setF] = useState({ county: 'Nairobi', area: '', areas: '', maxTravel: '15', freeRadius: '5', lat: 0, lng: 0 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!p) return;
    setF({ county: p.county ?? 'Nairobi', area: p.area ?? '', maxTravel: String(Number(p.max_travel_km ?? 15)), freeRadius: String(Number(p.free_radius_km ?? 5)),
      areas: (p.service_areas ?? []).filter((a: any) => a.estate).map((a: any) => a.estate).join(', '), lat: Number(p.lat) || 0, lng: Number(p.lng) || 0 });
  }, [p]);

  const days = p?.location_updated_at ? Math.floor((Date.now() - new Date(p.location_updated_at).getTime()) / 86_400_000) : null;
  
  const save = async () => {
    setBusy(true);
    try {
      const c = COUNTY_CENTERS[f.county];
      await api.updateLocation({
        lat: f.lat || c?.lat, lng: f.lng || c?.lng, county: f.county, area: f.area || undefined,
        maxTravelKm: Number(f.maxTravel) || 15, freeRadiusKm: Number(f.freeRadius) || 0,
        serviceAreas: [{ county: f.county }, ...f.areas.split(',').map((s) => s.trim()).filter(Boolean).map((estate) => ({ county: f.county, estate }))],
      });
      t.ok('Location updated'); me.refresh();
    } catch (e) { t.err(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Card>
      <h3>Location and service area</h3>
      <p className="small muted">Customers near you are matched using this. Update it whenever you move, so you are found and booked where you actually are. {days != null ? (days === 0 ? 'Last updated today.' : `Last updated ${days} day${days === 1 ? '' : 's'} ago.`) : ''}</p>
      {days != null && days >= 3 ? <div className="banner">Your location has not been updated for {days} days. Check it is still right.</div> : null}
      <AddressSearch label="Where are you based?" value={f.area} near={f.lat ? { lat: f.lat, lng: f.lng } : null}
  onChange={(v) => setF((o) => ({ ...o, area: v, lat: 0, lng: 0 }))}
  onPick={(p) => setF((o) => ({ ...o, area: p.address, lat: p.lat, lng: p.lng, county: nearestCounty(p.lat, p.lng) || o.county }))} />
<p className="small muted">{f.lat ? `Pinned at ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : 'No pin yet. The centre of your county is used.'}</p>
<Select label="County" value={f.county} onChange={(e) => setF({ ...f, county: e.target.value })} options={KENYA_COUNTIES.map((c) => ({ value: c, label: c }))} />
      <TextField label="Other areas you serve (comma separated)" value={f.areas} onChange={(e) => setF({ ...f, areas: e.target.value })} />
      <div className="grid g2">
        <TextField label="Travel up to (km)" inputMode="decimal" value={f.maxTravel} onChange={(e) => setF({ ...f, maxTravel: e.target.value })} />
        <TextField label="Free travel within (km)" inputMode="decimal" value={f.freeRadius} onChange={(e) => setF({ ...f, freeRadius: e.target.value })} />
      </div>
      <Button loading={busy} onClick={save}>Save location</Button>
    </Card>
  );
}