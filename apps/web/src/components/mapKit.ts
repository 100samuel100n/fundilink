'use client';
import { useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { LatLng } from '@fundilink/sdk';

/* ------------------------------------------------------------------ theme + style */
export type Theme = 'light' | 'dark';

export function useMapTheme(): Theme {
  // maps only render in the browser, so the real preference is known on the first render (no light-to-dark flash)
  const [t, setT] = useState<Theme>(() => (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setT(mq.matches ? 'dark' : 'light');
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return t;
}

/**
 * Vector basemap, in order of preference:
 *  1. NEXT_PUBLIC_MAP_STYLE_LIGHT / NEXT_PUBLIC_MAP_STYLE_DARK: any MapLibre style URL (your own Mapbox-compatible, Stadia, Protomaps...)
 *  2. NEXT_PUBLIC_MAPTILER_KEY: MapTiler Streets (light + dark), the recommended production setup
 *  3. OpenFreeMap: free, no key, vector + 3D buildings. Dark mode is produced by tinting the canvas.
 */
export function resolveStyle(theme: Theme): { url: string; tint: boolean } {
  const light = process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT; const dark = process.env.NEXT_PUBLIC_MAP_STYLE_DARK;
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (theme === 'dark' && dark) return { url: dark, tint: false };
  if (theme === 'light' && light) return { url: light, tint: false };
  if (key) return { url: `https://api.maptiler.com/maps/${theme === 'dark' ? 'streets-v2-dark' : 'streets-v2'}/style.json?key=${key}`, tint: false };
  return { url: 'https://tiles.openfreemap.org/styles/liberty', tint: theme === 'dark' };
}

export const palette = (t: Theme) => t === 'dark'
  ? { route: '#34D1BE', casing: '#06201D', done: '#5B7088', trail: '#9AAEC6', building: '#22334D' }
  : { route: '#0B7F73', casing: '#FFFFFF', done: '#9DB0C4', trail: '#142A3B', building: '#DFE3EA' };

/* ------------------------------------------------------------------ geometry */
export const ll = (p: LatLng): [number, number] => [p.lng, p.lat];
const rad = (d: number) => (d * Math.PI) / 180;
export const metres = (a: LatLng, b: LatLng) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
};
export const bearingDeg = (a: LatLng, b: LatLng) => {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpolate angles along the short way round (350 -> 10 passes through 0, not 180). */
export const lerpAngle = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };

/** Index of the route vertex nearest to `p`, searching forward from `from` so the progress never runs backwards. */
export function nearestIndex(route: LatLng[], p: LatLng, from = 0): number {
  let best = from; let bd = Infinity;
  const end = Math.min(route.length, from + 400);
  for (let i = from; i < end; i++) { const d = (route[i].lat - p.lat) ** 2 + (route[i].lng - p.lng) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

/* ------------------------------------------------------------------ map helpers */
export function firstSymbolId(map: maplibregl.Map): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
}

/** Add or update a GeoJSON line layer. Lines are inserted under the label layers so street names stay readable on top. */
export function setLine(map: maplibregl.Map, id: string, coords: [number, number][], paint: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const data = (coords.length > 1
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
    : { type: 'FeatureCollection', features: [] }) as GeoJSON.Feature | GeoJSON.FeatureCollection;
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  map.addSource(id, { type: 'geojson', data });
  map.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round', ...layout }, paint } as maplibregl.LayerSpecification, firstSymbolId(map));
}

/** Width that grows with zoom so a route reads as a road-sized ribbon at every scale. */
export const widthByZoom = (lo: number, mid: number, hi: number) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, lo, 15, mid, 19, hi] as unknown;

/** Adds extruded buildings when the basemap does not already have them (MapTiler/Positron-style sources). */
export function ensure3dBuildings(map: maplibregl.Map, theme: Theme) {
  try {
    const st = map.getStyle(); if (!st) return;
    if (st.layers.some((l) => l.type === 'fill-extrusion') || map.getLayer('fl-3d')) return;
    const src = Object.entries(st.sources).find(([, s]) => s.type === 'vector')?.[0];
    if (!src || !st.layers.some((l) => 'source-layer' in l && (l as { 'source-layer'?: string })['source-layer'] === 'building')) return;
    map.addLayer({
      id: 'fl-3d', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 15,
      paint: {
        'fill-extrusion-color': palette(theme).building, 'fill-extrusion-opacity': 0.82,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 9],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      },
    } as maplibregl.LayerSpecification, firstSymbolId(map));
  } catch { /* the basemap simply stays flat */ }
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ DOM markers */
const el = (cls: string, html = '') => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; return d; };

/** Destination: a pin with a soft radar pulse and an optional ETA bubble above it. */
export function destinationEl(label: string) {
  const root = el('fm-dest');
  root.innerHTML = `<span class="fm-bubble" hidden></span><span class="fm-pulse"></span><span class="fm-pulse b"></span>
  <svg class="fm-pin" viewBox="0 0 40 52" width="40" height="52" aria-hidden="true"><path d="M20 51C20 51 4 33 4 20a16 16 0 0 1 32 0c0 13-16 31-16 31z" fill="#142A3B" stroke="#fff" stroke-width="3"/>
  <path d="M20 11l9 7.5V29h-6v-6h-6v6h-6V18.5z" fill="#fff"/></svg><span class="fm-tag"></span>`;
  (root.querySelector('.fm-tag') as HTMLElement).textContent = label;
  return root;
}
export function setBubble(root: HTMLElement, text: string | null) {
  const b = root.querySelector('.fm-bubble') as HTMLElement | null; if (!b) return;
  if (text) { b.textContent = text; b.hidden = false; } else b.hidden = true;
}

/** Search-result pin used on the explore map. */
export const proPinEl = (kind: 'pro' | 'dest' | 'live' = 'pro') => el(`fm-dot ${kind}`);

/** A pulsing "you are here" dot for generic maps. */
export const liveDotEl = (stale: boolean) => el(`fm-live${stale ? ' stale' : ''}`, '<span></span><i></i>');