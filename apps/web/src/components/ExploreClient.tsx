'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { COUNTY_CENTERS, KENYA_CENTER, PRICING_LABEL, type Category, type SearchParams, type SearchResult, type UnderstoodSearch } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { getPosition, useAsync } from '@/lib/hooks';
import { ProCardView } from './ProCard';
import { Icon } from './Icon';
import { withoutSamples } from '@/lib/sample';
import { MapLazy } from './MapLazy';
import { Button, Check, Chip, Empty, ErrorState, Select, Skeleton, TextField } from './ui';

const SORTS = [['recommended', 'Recommended'], ['nearest', 'Nearest'], ['rating', 'Highest rated'], ['experience', 'Most experienced'], ['price', 'Lowest price'], ['earliest', 'Earliest availability'], ['jobs', 'Most completed jobs']] as const;

export function ExploreClient({ fixedCategory, categories }: { fixedCategory?: string; categories: Category[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const [f, setF] = useState<SearchParams>({
    q: sp.get('q') ?? undefined, category: fixedCategory ?? sp.get('category') ?? undefined, lat: num('lat'), lng: num('lng'), radiusKm: num('radiusKm'),
    minRating: num('minRating'), verifiedOnly: sp.get('verifiedOnly') === '1', availableNow: sp.get('availableNow') === '1' || sp.get('emergency') === '1',
    minYears: num('minYears'), businessType: (sp.get('businessType') as any) || undefined, language: sp.get('language') ?? undefined,
    pricing: (sp.get('pricing') as any) || undefined, sort: (sp.get('sort') as any) || 'recommended', limit: 30,
  });
  const [county, setCounty] = useState(sp.get('county') ?? '');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [nl, setNl] = useState(sp.get('nl') ?? '');
  const [understood, setUnderstood] = useState<UnderstoodSearch | null>(null);
  const [locErr, setLocErr] = useState('');
  const emergency = sp.get('emergency') === '1';

  // Natural-language request: let the AI pick the category/keywords, then search.
  useEffect(() => {
    const text = sp.get('nl');
    if (!text) return;
    api.understand(text).then((u) => { setUnderstood(u); setF((p) => ({ ...p, category: u.category ?? p.category, q: u.category ? p.q : u.problem, availableNow: u.urgent || p.availableNow })); }).catch(() => setF((p) => ({ ...p, q: text })));
  }, [sp]);

  const center = f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : county && COUNTY_CENTERS[county] ? COUNTY_CENTERS[county] : KENYA_CENTER;
  const eff = useMemo(() => (county && f.lat == null ? { ...f, lat: COUNTY_CENTERS[county]?.lat, lng: COUNTY_CENTERS[county]?.lng, radiusKm: f.radiusKm ?? 25 } : f), [f, county]);
  const res = useAsync<SearchResult>(async () => { const r = await api.search(eff); return { ...r, results: withoutSamples(r.results) }; }, [JSON.stringify(eff)]);
  const set = (p: Partial<SearchParams>) => setF((o) => ({ ...o, ...p }));
  const near = async () => { try { const g = await getPosition(); setLocErr(''); set({ lat: g.lat, lng: g.lng, radiusKm: f.radiusKm ?? 10, sort: 'nearest' }); } catch (e: any) { setLocErr(e.message); } };
  const clear = () => { setF({ sort: 'recommended', limit: 30, category: fixedCategory }); setCounty(''); router.replace(fixedCategory ? `/explore/${fixedCategory}` : '/explore'); };

  return (
    <div className="wrap section">
      {emergency || understood?.urgent ? (
        <div className="safety" style={{ marginBottom: 16 }}><Icon name="alertCircle" size={22} /><div>
          Showing professionals who are available now and take urgent jobs. Each one confirms their own arrival time; none is guaranteed until they accept.
          {understood?.dangerous ? ' If there is gas, sparking wires or structural danger: switch off at the mains if it is safe, keep clear, and call 999 or 112 first.' : ''}
        </div></div>
      ) : null}
      {nl && understood ? (
        <div className="row wrap-r" style={{ marginBottom: 14, gap: 8 }} aria-live="polite">
          <span className="muted small">We understood:</span>
          <span className="vbadge" style={{ background: 'var(--neutral-bg)', color: 'var(--ink)' }}>{understood.problem}</span>
          {understood.category ? <span className="vbadge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-dark)' }}>{categories.find((c) => c.slug === understood.category)?.name ?? understood.category}</span> : null}
          {understood.locationText ? <span className="vbadge" style={{ background: 'var(--neutral-bg)', color: 'var(--ink)' }}><Icon name="pin" size={12} />{understood.locationText}</span> : null}
          {understood.dateText || understood.timeOfDay ? <span className="vbadge" style={{ background: 'var(--neutral-bg)', color: 'var(--ink)' }}><Icon name="calendar" size={12} />{[understood.dateText, understood.timeOfDay].filter(Boolean).join(', ')}</span> : null}
          {understood.urgent ? <span className="vbadge" style={{ background: 'var(--bad-bg)', color: 'var(--bad-fg)' }}>Urgent</span> : null}
          <span className="muted small">Change anything in the filters.</span>
        </div>
      ) : null}

      <div className="split">
        <aside aria-label="Filters" className="card sticky" style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
          <TextField label="Name or keyword" value={f.q ?? ''} onChange={(e) => set({ q: e.target.value || undefined })} placeholder="e.g. plumber, tap repair" />
          {!fixedCategory ? <Select label="Category" value={f.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })} options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]} /> : null}
          <Select label="County / town" value={county} onChange={(e) => { setCounty(e.target.value); set({ lat: undefined, lng: undefined }); }} options={[{ value: '', label: 'Anywhere in Kenya' }, ...Object.keys(COUNTY_CENTERS).map((c) => ({ value: c, label: c }))]} />
          <Button tone="secondary" small block onClick={near}><Icon name="pin" size={16} /> Use my exact location</Button>
          {locErr ? <p className="small" role="alert" style={{ color: 'var(--bad-fg)' }}>{locErr}</p> : null}
          <div className="lbl" style={{ margin: '12px 0 6px' }}>Distance</div>
          <div className="chips">{[2, 5, 10, 20].map((k) => <Chip key={k} label={`${k} km`} on={f.radiusKm === k} onClick={() => set({ radiusKm: f.radiusKm === k ? undefined : k })} />)}</div>
          <div className="lbl" style={{ margin: '12px 0 6px' }}>Minimum rating</div>
          <div className="chips">{[3, 4, 4.5].map((k) => <Chip key={k} label={`${k}+ ★`} on={f.minRating === k} onClick={() => set({ minRating: f.minRating === k ? undefined : k })} />)}</div>
          <div style={{ marginTop: 12 }}>
            <Check label="Verified only" checked={!!f.verifiedOnly} onChange={(e) => set({ verifiedOnly: e.target.checked })} />
            <Check label="Available now" checked={!!f.availableNow} onChange={(e) => set({ availableNow: e.target.checked })} />
          </div>
          <Select label="Experience" value={String(f.minYears ?? '')} onChange={(e) => set({ minYears: e.target.value ? Number(e.target.value) : undefined })} options={[{ value: '', label: 'Any' }, { value: 2, label: '2+ years' }, { value: 5, label: '5+ years' }, { value: 10, label: '10+ years' }]} />
          <Select label="Business type" value={f.businessType ?? ''} onChange={(e) => set({ businessType: (e.target.value || undefined) as any })} options={[{ value: '', label: 'Any' }, { value: 'individual', label: 'Individual' }, { value: 'business', label: 'Registered business' }]} />
          <Select label="Pricing" value={f.pricing ?? ''} onChange={(e) => set({ pricing: (e.target.value || undefined) as any })} options={[{ value: '', label: 'Any' }, ...Object.entries(PRICING_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          <Select label="Language" value={f.language ?? ''} onChange={(e) => set({ language: e.target.value || undefined })} options={[{ value: '', label: 'Any' }, { value: 'en', label: 'English' }, { value: 'sw', label: 'Kiswahili' }]} />
          <Button tone="ghost" small block onClick={clear}>Clear filters</Button>
        </aside>

        <section aria-live="polite">
          <div className="row between wrap-r" style={{ marginBottom: 12 }}>
            <strong>{res.data ? `${res.data.results.length} professional${res.data.results.length === 1 ? '' : 's'}` : 'Searching…'}</strong>
            <div className="row">
              <Select label="" aria-label="Sort by" value={f.sort} onChange={(e) => set({ sort: e.target.value as any })} options={SORTS.map(([v, l]) => ({ value: v, label: l }))} />
              <div role="group" aria-label="View" className="chips" style={{ flexWrap: 'nowrap' }}>
                <Chip label="List" on={view === 'list'} onClick={() => setView('list')} /><Chip label="Map" on={view === 'map'} onClick={() => setView('map')} />
              </div>
            </div>
          </div>
          {res.loading ? <Skeleton h={140} n={4} /> : res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data?.results.length ? (
            <Empty title="No professionals match" body="Try a wider distance, fewer filters, or request quotations and let professionals come to you." action={<Button onClick={clear}>Clear filters</Button>} />
          ) : view === 'map' ? (
            <MapLazy center={center} markers={res.data.results.map((p) => ({ id: p.id, lat: p.mapPin.lat, lng: p.mapPin.lng, label: `${p.businessName ?? p.name}: ${p.rating.toFixed(1)}★`, href: `/professionals/${p.slug}` }))} className="mapbox tall" />
          ) : (
            <div className="stack">{res.data.results.map((p) => <ProCardView key={p.id} pro={p} sponsored={res.data!.sponsored.includes(p.id)} />)}</div>
          )}
          <p className="muted small" style={{ marginTop: 12 }}>Map pins show approximate service areas, never a professional’s live position.</p>
        </section>
      </div>
    </div>
  );
}
