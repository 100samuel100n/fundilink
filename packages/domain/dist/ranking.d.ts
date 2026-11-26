/**
 * Recommendation score:  S = 0.25L + 0.20Q + 0.15A + 0.15R + 0.10P + 0.15C
 * Every input is normalised to 0..1. Weights live in platform_settings and should be calibrated on real data.
 * Design rules from the blueprint:
 *  - lowest price is NOT the default winner (P rewards fit to the customer's budget / market median)
 *  - a handful of reviews must not decide ranking (Bayesian smoothing)
 *  - newcomers get a decaying exploration boost so they are not buried
 *  - a paid activation fee or subscription never appears as an input
 */
export interface Weights {
    L: number;
    Q: number;
    A: number;
    R: number;
    P: number;
    C: number;
}
export declare const DEFAULT_WEIGHTS: Weights;
export interface Candidate {
    id: string;
    distanceKm: number;
    serviceRadiusKm: number;
    specialisationMatch: number;
    availableNow: boolean;
    hoursUntilNextSlot: number;
    avgRating: number;
    reviewCount: number;
    completedJobs: number;
    completionRate: number;
    cancellationRate: number;
    avgResponseMinutes: number;
    startingPrice: number;
    verifiedIdentity: boolean;
}
export interface Query {
    budget?: number;
    marketMedianPrice: number;
    priorRating?: number;
}
export declare function locationScore(c: Candidate): number;
export declare function availabilityScore(c: Candidate): number;
/** Bayesian average: pulls low-review profiles toward the platform mean. */
export declare function reputationScore(c: Candidate, prior?: number, m?: number): number;
export declare function reliabilityScore(c: Candidate, priorCompletion?: number, m?: number): number;
/** Fit to budget (or market median). Cheap-but-suspicious and very expensive both lose points. */
export declare function priceScore(c: Candidate, q: Query): number;
/** Decaying boost for accounts with few completed jobs (max +0.08). */
export declare function newcomerBoost(c: Candidate): number;
export declare function score(c: Candidate, q: Query, w?: Weights): {
    total: number;
    parts: {
        L: number;
        Q: number;
        A: number;
        R: number;
        P: number;
        C: number;
    };
};
export declare function rank(cs: Candidate[], q: Query, w?: Weights): {
    total: number;
    parts: {
        L: number;
        Q: number;
        A: number;
        R: number;
        P: number;
        C: number;
    };
    candidate: Candidate;
}[];
