import type { LatLng } from './types.ts';

/**
 * Enroute journey model shared by web and mobile.
 * The server owns the booking status (see bookingStateMachine); this module turns that status plus live GPS data into
 * what the customer and the professional see. Nothing here is timer-driven: every message comes from real journey data.
 */
export type JourneyStage = 'requested' | 'confirmed' | 'preparing' | 'enroute' | 'approaching' | 'arrived' | 'working' | 'completed' | 'cancelled';

export interface JourneyStepDef {
  stage: JourneyStage; label: string;
  /** Who moves the booking into this stage. */
  actor: 'customer' | 'professional' | 'system';
  /** Audit event name written with the status history row. */
  event: string;
  /** Does entering this stage notify the customer? */
  notifyCustomer: boolean;
  customer: string; professional: string;
}

/** The ordered happy path. `approaching` is derived from live data; the rest map 1:1 to booking statuses. */
export const JOURNEY_STEPS: JourneyStepDef[] = [
  { stage: 'confirmed', label: 'Accepted', actor: 'professional', event: 'booking.confirmed', notifyCustomer: true, customer: 'Professional confirmed', professional: 'You accepted this job' },
  { stage: 'preparing', label: 'Preparing', actor: 'system', event: 'journey.preparing', notifyCustomer: false, customer: 'Your professional is preparing to leave', professional: 'Time to get ready and check your tools' },
  { stage: 'enroute', label: 'On the way', actor: 'professional', event: 'journey.started', notifyCustomer: true, customer: 'Your professional has started the journey', professional: 'Journey started. Your live location is shared with the customer' },
  { stage: 'approaching', label: 'Nearby', actor: 'system', event: 'journey.approaching', notifyCustomer: true, customer: 'Your professional is approaching your area', professional: 'You are close. Mark arrived when you reach the door' },
  { stage: 'arrived', label: 'Arrived', actor: 'professional', event: 'journey.arrived', notifyCustomer: true, customer: 'Your professional has arrived', professional: 'Ask the customer for their start PIN' },
  { stage: 'working', label: 'Work started', actor: 'professional', event: 'work.started', notifyCustomer: true, customer: 'The service is underway', professional: 'Work in progress. Location sharing has stopped' },
  { stage: 'completed', label: 'Completed', actor: 'customer', event: 'work.completed', notifyCustomer: true, customer: 'Work completed', professional: 'Work completed' },
];
export const CANCELLED_STEP: JourneyStepDef = { stage: 'cancelled', label: 'Cancelled', actor: 'customer', event: 'booking.cancelled', notifyCustomer: true, customer: 'This booking was cancelled', professional: 'This booking was cancelled' };

export const APPROACH_MINUTES = 5;
export const APPROACH_KM = 1;
/** Treat the visit as "preparing" this long before the scheduled start. */
export const PREPARING_WINDOW_MIN = 60;

export interface StageInput {
  status: string; startsAt?: string | number | Date | null; etaMinutes?: number | null; remainingKm?: number | null; nearby?: boolean | null; now?: number;
}

export function deriveStage(i: StageInput): JourneyStage {
  const s = i.status;
  if (['cancelled', 'declined', 'refunded', 'partially_refunded'].includes(s)) return 'cancelled';
  if (['completed', 'settlement_pending', 'settled'].includes(s)) return 'completed';
  if (['in_progress', 'awaiting_completion', 'disputed'].includes(s)) return 'working';
  if (s === 'arrived') return 'arrived';
  if (s === 'en_route') {
    const close = i.nearby || (i.etaMinutes != null && i.etaMinutes > 0 && i.etaMinutes <= APPROACH_MINUTES) || (i.remainingKm != null && i.remainingKm > 0 && i.remainingKm <= APPROACH_KM);
    return close ? 'approaching' : 'enroute';
  }
  if (s === 'confirmed' || s === 'scheduled') {
    if (i.startsAt != null) {
      const t = new Date(i.startsAt).getTime();
      const now = i.now ?? Date.now();
      if (Number.isFinite(t) && t - now <= PREPARING_WINDOW_MIN * 60_000) return 'preparing';
    }
    return 'confirmed';
  }
  return 'requested';
}

export type Freshness = 'live' | 'delayed' | 'stale' | 'none';
export const LIVE_MAX_MS = 30_000;
export const DELAYED_MAX_MS = 90_000;

/** A position older than 90 s is never presented as live. */
export function locationFreshness(lastFixAt: number | null | undefined, now = Date.now()): Freshness {
  if (lastFixAt == null) return 'none';
  const age = Math.max(0, now - lastFixAt);
  if (age <= LIVE_MAX_MS) return 'live';
  if (age <= DELAYED_MAX_MS) return 'delayed';
  return 'stale';
}

export function ageLabel(lastFixAt: number | null | undefined, now = Date.now()): string {
  if (lastFixAt == null) return 'No location yet';
  const s = Math.max(0, Math.round((now - lastFixAt) / 1000));
  if (s < 10) return 'Updated just now';
  if (s < 60) return `Updated ${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `Updated ${m} min ago` : 'Updated over an hour ago';
}

export function freshnessLabel(f: Freshness): string {
  return f === 'live' ? 'Live' : f === 'delayed' ? 'Updating' : f === 'stale' ? 'Last known location' : 'Waiting for location';
}

export type EtaConfidence = 'high' | 'medium' | 'low';
export interface EtaEstimate { minutes: number | null; window: [number, number] | null; confidence: EtaConfidence; stopped: boolean; label: string }

/**
 * ETA comes from the routing provider on the server (road network and traffic); this only qualifies it.
 * Confidence drops when the fix is old, inaccurate, or the vehicle has stopped, and the stated window widens with it.
 */
export function describeEta(i: { etaMinutes?: number | null; fixAt?: number | null; speedKmh?: number | null; accuracyM?: number | null; now?: number }): EtaEstimate {
  const fresh = locationFreshness(i.fixAt, i.now);
  const eta = i.etaMinutes != null && i.etaMinutes > 0 ? Math.max(1, Math.round(i.etaMinutes)) : null;
  const stopped = fresh === 'live' && i.speedKmh != null && i.speedKmh < 2;
  if (eta == null) return { minutes: null, window: null, confidence: 'low', stopped, label: fresh === 'none' ? 'Waiting for location' : 'Estimating arrival' };
  let confidence: EtaConfidence = 'high';
  if (fresh === 'delayed' || stopped || (i.accuracyM != null && i.accuracyM > 50)) confidence = 'medium';
  if (fresh === 'stale' || fresh === 'none' || (i.accuracyM != null && i.accuracyM > 150)) confidence = 'low';
  const spread = confidence === 'high' ? 0.15 : confidence === 'medium' ? 0.3 : 0.5;
  const lo = Math.max(1, Math.floor(eta * (1 - spread))); const hi = Math.max(lo + 1, Math.ceil(eta * (1 + spread)));
  const label = confidence === 'high' ? `${eta} min away` : `Arrives in ${lo}-${hi} min`;
  return { minutes: eta, window: [lo, hi], confidence, stopped, label };
}

const R = 6371;
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GpsFix extends LatLng { at: number; accuracyM?: number | null }
export const MAX_ACCURACY_M = 100;
export const MAX_SPEED_KMH = 160;

/**
 * GPS drift filter for the professional's device: drops inaccurate fixes and teleports (urban canyons, tunnels, a cold
 * start). Returns true when `next` should be sent. Fixes closer than 5 m are ignored as noise.
 */
export function acceptGpsFix(prev: GpsFix | null, next: GpsFix): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (next.accuracyM != null && next.accuracyM > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const dtH = (next.at - prev.at) / 3_600_000;
  if (dtH <= 0) return false;
  const km = distanceKm(prev, next);
  if (km < 0.005) return false;
  return km / dtH <= MAX_SPEED_KMH;
}

export type Viewer = 'customer' | 'professional';

/** The headline sentence for the current stage, written from real data. */
export function journeyMessage(stage: JourneyStage, viewer: Viewer, i: { etaMinutes?: number | null; fresh?: Freshness } = {}): string {
  const def = stage === 'cancelled' ? CANCELLED_STEP : JOURNEY_STEPS.find((s) => s.stage === stage);
  if (stage === 'requested') return viewer === 'customer' ? 'Waiting for the professional to accept' : 'Respond to this request';
  if (!def) return '';
  if (viewer === 'customer' && (stage === 'enroute' || stage === 'approaching')) {
    if (i.fresh === 'stale') return 'Showing your professional’s last known location';
    if (i.etaMinutes && i.etaMinutes > 0) return stage === 'approaching' ? `Your professional is approximately ${Math.max(1, Math.round(i.etaMinutes))} min away` : `${def.customer}. About ${Math.round(i.etaMinutes)} min to go`;
  }
  return viewer === 'customer' ? def.customer : def.professional;
}

export interface TimelineEntry { stage: JourneyStage; label: string; state: 'done' | 'current' | 'upcoming'; at: string | null; actor: string | null }
const STATUS_TO_STAGE: Record<string, JourneyStage> = { confirmed: 'confirmed', scheduled: 'confirmed', en_route: 'enroute', arrived: 'arrived', in_progress: 'working', completed: 'completed' };

/** Timeline with real timestamps and actors taken from the booking's audit history. */
export function buildTimeline(stage: JourneyStage, history: { to_status: string; actor: string; created_at: string }[] = []): TimelineEntry[] {
  if (stage === 'cancelled') {
    const h = history.find((x) => x.to_status === 'cancelled');
    return [{ stage: 'cancelled', label: 'Cancelled', state: 'current', at: h?.created_at ?? null, actor: h?.actor ?? null }];
  }
  const idx = Math.max(0, JOURNEY_STEPS.findIndex((s) => s.stage === (stage === 'requested' ? 'confirmed' : stage)));
  return JOURNEY_STEPS.map((s, n) => {
    const h = history.find((x) => STATUS_TO_STAGE[x.to_status] === s.stage);
    const state = stage === 'requested' ? 'upcoming' : n < idx ? 'done' : n === idx ? 'current' : 'upcoming';
    return { stage: s.stage, label: s.label, state, at: h?.created_at ?? null, actor: h?.actor ?? null };
  });
}

/** Hand-off to the phone's navigation app. */
export const navigationUrl = (dest: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
