export interface LatLng {
    lat: number;
    lng: number;
}
export declare function haversineKm(a: LatLng, b: LatLng): number;
export declare const RADIUS_OPTIONS_KM: readonly [2, 5, 10, 20];
/** Approximate straight-line distance to road distance for ETA estimates when no routing API is available. */
export declare const roadKmEstimate: (straightKm: number) => number;
export declare function etaMinutes(roadKm: number, avgKmh?: number): number;
/**
 * Fuzz a point for public display so a professional's exact base location is never exposed.
 * Deterministic per seed so the pin doesn't jump around between page loads.
 */
export declare function approximateLocation(p: LatLng, seed: string, radiusKm?: number): LatLng;
/** Ramer-style thinning so long live routes stay light on low-end phones. */
export declare function thinRoute(points: LatLng[], minStepKm?: number): LatLng[];
