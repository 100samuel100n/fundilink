import type { LatLng } from './types.ts';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export const distM = (a: LatLng, b: LatLng) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
export const bearing = (a: LatLng, b: LatLng) => {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/** Evenly spaced points along a polyline (by distance). */
export function resample(route: LatLng[], n: number): LatLng[] {
  if (route.length < 2) return route;
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < route.length; i++) { const d = distM(route[i - 1], route[i]); seg.push(d); total += d; }
  const out: LatLng[] = [route[0]];
  for (let k = 1; k < n; k++) {
    let target = (total * k) / n, i = 0;
    while (i < seg.length - 1 && target > seg[i]) { target -= seg[i]; i++; }
    const t = seg[i] ? Math.min(1, target / seg[i]) : 0;
    out.push({ lat: route[i].lat + (route[i + 1].lat - route[i].lat) * t, lng: route[i].lng + (route[i + 1].lng - route[i].lng) * t });
  }
  out.push(route[route.length - 1]);
  return out;
}

export interface Fix extends LatLng { heading: number; speedKmh: number; index: number; total: number }

/**
 * Demo drive simulator: walks a route and emits a GPS fix every `intervalMs`. The professional's screen sends each fix through the
 * normal tracking socket, so the customer sees exactly what they would see for a real journey.
 * Default: 48 steps x 1.5 s = about 72 seconds, regardless of route length.
 */
export function simulateDrive(route: LatLng[], o: { steps?: number; intervalMs?: number; onFix: (f: Fix) => void; onDone?: () => void }) {
  const pts = resample(route, o.steps ?? 48);
  const every = o.intervalMs ?? 1500;
  let i = 0; let stopped = false;
  const tick = () => {
    if (stopped) return;
    const p = pts[i], prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    const speed = i === 0 ? 0 : Math.min(48, Math.max(18, (distM(prev, p) / (every / 1000)) * 3.6 * 0.18));
    o.onFix({ lat: p.lat, lng: p.lng, heading: Math.round(bearing(prev === p ? p : prev, next === p ? p : next)), speedKmh: Math.round(speed), index: i, total: pts.length });
    if (i >= pts.length - 1) { stopped = true; o.onDone?.(); return; }
    i++; timer = setTimeout(tick, every);
  };
  let timer = setTimeout(tick, 0);
  return { stop: () => { stopped = true; clearTimeout(timer); } };
}
