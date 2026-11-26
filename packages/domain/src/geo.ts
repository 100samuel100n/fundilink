export interface LatLng { lat: number; lng: number }

const R = 6371.0088; // km
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const RADIUS_OPTIONS_KM = [2, 5, 10, 20] as const;

/** Approximate straight-line distance to road distance for ETA estimates when no routing API is available. */
export const roadKmEstimate = (straightKm: number) => straightKm * 1.35;

export function etaMinutes(roadKm: number, avgKmh = 22) {
  return Math.max(1, Math.round((roadKm / avgKmh) * 60));
}

/**
 * Fuzz a point for public display so a professional's exact base location is never exposed.
 * Deterministic per seed so the pin doesn't jump around between page loads.
 */
export function approximateLocation(p: LatLng, seed: string, radiusKm = 0.6): LatLng {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const angle = ((h >>> 0) % 36000) / 36000 * 2 * Math.PI;
  const dist = (((h >>> 8) >>> 0) % 1000) / 1000 * radiusKm;
  const dLat = (dist / R) * (180 / Math.PI) * Math.cos(angle);
  const dLng = ((dist / R) * (180 / Math.PI) * Math.sin(angle)) / Math.cos(rad(p.lat));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/** Ramer-style thinning so long live routes stay light on low-end phones. */
export function thinRoute(points: LatLng[], minStepKm = 0.03): LatLng[] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (haversineKm(out[out.length - 1], points[i]) >= minStepKm) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}
