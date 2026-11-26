"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WEIGHTS = void 0;
exports.locationScore = locationScore;
exports.availabilityScore = availabilityScore;
exports.reputationScore = reputationScore;
exports.reliabilityScore = reliabilityScore;
exports.priceScore = priceScore;
exports.newcomerBoost = newcomerBoost;
exports.score = score;
exports.rank = rank;
exports.DEFAULT_WEIGHTS = { L: 0.25, Q: 0.2, A: 0.15, R: 0.15, P: 0.1, C: 0.15 };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function locationScore(c) {
    if (c.distanceKm > c.serviceRadiusKm)
        return 0;
    return clamp01(1 - c.distanceKm / Math.max(c.serviceRadiusKm, 1)) ** 0.7;
}
function availabilityScore(c) {
    if (c.availableNow)
        return 1;
    return clamp01(1 - c.hoursUntilNextSlot / 72);
}
/** Bayesian average: pulls low-review profiles toward the platform mean. */
function reputationScore(c, prior = 4.2, m = 8) {
    const smoothed = (c.reviewCount * c.avgRating + m * prior) / (c.reviewCount + m);
    return clamp01(smoothed / 5);
}
function reliabilityScore(c, priorCompletion = 0.9, m = 10) {
    // smooth by job count: 100% from 1 job must not look better than 96% from 60
    const completion = (c.completedJobs * c.completionRate + m * priorCompletion) / (c.completedJobs + m);
    const responsiveness = clamp01(1 - c.avgResponseMinutes / 120);
    return clamp01(0.5 * completion + 0.3 * (1 - c.cancellationRate) + 0.2 * responsiveness);
}
/** Fit to budget (or market median). Cheap-but-suspicious and very expensive both lose points. */
function priceScore(c, q) {
    const target = q.budget ?? q.marketMedianPrice;
    const ratio = c.startingPrice / target;
    if (q.budget !== undefined && ratio <= 1)
        return 1;
    const deviation = Math.abs(Math.log(ratio));
    return clamp01(1 - deviation / Math.log(3));
}
/** Decaying boost for accounts with few completed jobs (max +0.08). */
function newcomerBoost(c) {
    const k = 10;
    return c.verifiedIdentity ? 0.08 * Math.exp(-c.completedJobs / k) : 0;
}
function score(c, q, w = exports.DEFAULT_WEIGHTS) {
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
function rank(cs, q, w = exports.DEFAULT_WEIGHTS) {
    return cs
        .map((c) => ({ candidate: c, ...score(c, q, w) }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);
}
