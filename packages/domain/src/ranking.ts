/**
 * Recommendation score:  S = 0.25L + 0.20Q + 0.15A + 0.15R + 0.10P + 0.15C
 * Every input is normalised to 0..1. Weights live in platform_settings and should be calibrated on real data.
 * Design rules from the blueprint:
 *  - lowest price is NOT the default winner (P rewards fit to the customer's budget / market median)
 *  - a handful of reviews must not decide ranking (Bayesian smoothing)
 *  - newcomers get a decaying exploration boost so they are not buried
 *  - a paid activation fee or subscription never appears as an input
 */
export interface Weights { L: number; Q: number; A: number; R: number; P: number; C: number }
export const DEFAULT_WEIGHTS: Weights = { L: 0.25, Q: 0.2, A: 0.15, R: 0.15, P: 0.1, C: 0.15 };

export interface Candidate {
  id: string;
  distanceKm: number;
  serviceRadiusKm: number;
  specialisationMatch: number; // 0..1 how well their listed services match the query
  availableNow: boolean;
  hoursUntilNextSlot: number;
  avgRating: number; // 0..5
  reviewCount: number;
  completedJobs: number;
  completionRate: number; // 0..1
  cancellationRate: number; // 0..1
  avgResponseMinutes: number;
  startingPrice: number;
  verifiedIdentity: boolean;
}

export interface Query {
  budget?: number;
  marketMedianPrice: number;
  priorRating?: number; // platform-wide mean
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function locationScore(c: Candidate) {
  if (c.distanceKm > c.serviceRadiusKm) return 0;
  return clamp01(1 - c.distanceKm / Math.max(c.serviceRadiusKm, 1)) ** 0.7;
}

export function availabilityScore(c: Candidate) {
  if (c.availableNow) return 1;
  return clamp01(1 - c.hoursUntilNextSlot / 72);
}

/** Bayesian average: pulls low-review profiles toward the platform mean. */
export function reputationScore(c: Candidate, prior = 4.2, m = 8) {
  const smoothed = (c.reviewCount * c.avgRating + m * prior) / (c.reviewCount + m);
  return clamp01(smoothed / 5);
}

export function reliabilityScore(c: Candidate, priorCompletion = 0.9, m = 10) {
  // smooth by job count: 100% from 1 job must not look better than 96% from 60
  const completion = (c.completedJobs * c.completionRate + m * priorCompletion) / (c.completedJobs + m);
  const responsiveness = clamp01(1 - c.avgResponseMinutes / 120);
  return clamp01(0.5 * completion + 0.3 * (1 - c.cancellationRate) + 0.2 * responsiveness);
}

/** Fit to budget (or market median). Cheap-but-suspicious and very expensive both lose points. */
export function priceScore(c: Candidate, q: Query) {
  const target = q.budget ?? q.marketMedianPrice;
  const ratio = c.startingPrice / target;
  if (q.budget !== undefined && ratio <= 1) return 1;
  const deviation = Math.abs(Math.log(ratio));
  return clamp01(1 - deviation / Math.log(3));
}

/** Decaying boost for accounts with few completed jobs (max +0.08). */
export function newcomerBoost(c: Candidate) {
  const k = 10;
  return c.verifiedIdentity ? 0.08 * Math.exp(-c.completedJobs / k) : 0;
}

export function score(c: Candidate, q: Query, w: Weights = DEFAULT_WEIGHTS) {
  const parts = {
    L: locationScore(c),
    Q: clamp01(c.specialisationMatch),
    A: availabilityScore(c),
    R: reputationScore(c, q.priorRating),
    P: priceScore(c, q),
    C: reliabilityScore(c),
  };
  const base = w.L * parts.L + w.Q * parts.Q + w.A * parts.A + w.R * parts.R + w.P * parts.P + w.C * parts.C;
  const total = parts.L === 0 ? 0 : base + newcomerBoost(c); // out-of-area never ranks
  return { total, parts };
}

export function rank(cs: Candidate[], q: Query, w: Weights = DEFAULT_WEIGHTS) {
  return cs
    .map((c) => ({ candidate: c, ...score(c, q, w) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}
