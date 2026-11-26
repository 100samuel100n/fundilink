"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roadKmEstimate = exports.RADIUS_OPTIONS_KM = void 0;
exports.haversineKm = haversineKm;
exports.etaMinutes = etaMinutes;
exports.approximateLocation = approximateLocation;
exports.thinRoute = thinRoute;
const R = 6371.0088; // km
const rad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
exports.RADIUS_OPTIONS_KM = [2, 5, 10, 20];
/** Approximate straight-line distance to road distance for ETA estimates when no routing API is available. */
const roadKmEstimate = (straightKm) => straightKm * 1.35;
exports.roadKmEstimate = roadKmEstimate;
function etaMinutes(roadKm, avgKmh = 22) {
    return Math.max(1, Math.round((roadKm / avgKmh) * 60));
}
/**
 * Fuzz a point for public display so a professional's exact base location is never exposed.
 * Deterministic per seed so the pin doesn't jump around between page loads.
 */
function approximateLocation(p, seed, radiusKm = 0.6) {
    let h = 2166136261;
    for (const ch of seed) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    const angle = ((h >>> 0) % 36000) / 36000 * 2 * Math.PI;
    const dist = (((h >>> 8) >>> 0) % 1000) / 1000 * radiusKm;
    const dLat = (dist / R) * (180 / Math.PI) * Math.cos(angle);
    const dLng = ((dist / R) * (180 / Math.PI) * Math.sin(angle)) / Math.cos(rad(p.lat));
    return { lat: p.lat + dLat, lng: p.lng + dLng };
}
/** Ramer-style thinning so long live routes stay light on low-end phones. */
function thinRoute(points, minStepKm = 0.03) {
    if (points.length < 3)
        return points;
    const out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        if (haversineKm(out[out.length - 1], points[i]) >= minStepKm)
            out.push(points[i]);
    }
    out.push(points[points.length - 1]);
    return out;
}
