"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_FEES = exports.pct = void 0;
exports.buildInvoice = buildInvoice;
exports.travelFee = travelFee;
exports.assertRevisionAllowed = assertRevisionAllowed;
exports.validateMilestones = validateMilestones;
exports.milestoneAmounts = milestoneAmounts;
const pct = (amount, bps) => Math.round((amount * bps) / 10_000);
exports.pct = pct;
exports.DEFAULT_FEES = { commissionBps: 500, customerFeeBps: 0, taxBps: 0 };
function buildInvoice(lines, rules = exports.DEFAULT_FEES) {
    if (lines.length === 0)
        throw new Error('Invoice needs at least one line');
    const priced = lines.map((l) => {
        if (!Number.isInteger(l.unitAmount) || l.unitAmount < 0)
            throw new Error('unitAmount must be a non-negative integer');
        if (l.quantity <= 0)
            throw new Error('quantity must be positive');
        return { ...l, total: Math.round(l.quantity * l.unitAmount) };
    });
    const serviceSubtotal = priced.reduce((s, l) => s + l.total, 0);
    const customerFee = (0, exports.pct)(serviceSubtotal, rules.customerFeeBps);
    const tax = (0, exports.pct)(customerFee, rules.taxBps);
    const customerTotal = serviceSubtotal + customerFee + tax;
    const commission = (0, exports.pct)(serviceSubtotal, rules.commissionBps);
    const professionalNet = serviceSubtotal - commission;
    return {
        lines: priced,
        serviceSubtotal,
        customerFee,
        tax,
        customerTotal,
        commission,
        professionalNet,
        platformRevenue: commission + customerFee, // tax is a pass-through liability, not revenue
    };
}
function travelFee(distanceKm, p) {
    if (distanceKm > p.maxTravelKm) {
        if (!p.allowOutOfArea)
            return { ok: false, reason: 'out_of_service_area' };
        const extra = Math.ceil(distanceKm - p.freeRadiusKm) * p.perKmAmount;
        return { ok: true, km: distanceKm, fee: Math.max(p.minCallOut, extra + p.outOfAreaSurcharge) };
    }
    if (distanceKm <= p.freeRadiusKm)
        return { ok: true, km: distanceKm, fee: 0 };
    const billable = Math.ceil(distanceKm - p.freeRadiusKm);
    return { ok: true, km: distanceKm, fee: billable * p.perKmAmount };
}
function assertRevisionAllowed(r) {
    if (!r.reason.trim())
        throw new Error('A revision must explain why the price changed');
    if (r.revisedTotal > r.originalTotal && !r.customerApproved) {
        throw new Error('Price increase requires explicit customer approval before extra work starts');
    }
}
function validateMilestones(ms) {
    if (ms.length === 0)
        throw new Error('At least one milestone is required');
    const total = ms.reduce((s, m) => s + m.percentBps, 0);
    if (total !== 10_000)
        throw new Error(`Milestones must total 100% (got ${total / 100}%)`);
    for (const m of ms)
        if (!m.criteria.trim())
            throw new Error(`Milestone "${m.title}" needs completion criteria`);
}
/** Split a project total across milestones; the last milestone absorbs rounding drift. */
function milestoneAmounts(total, ms) {
    validateMilestones(ms);
    const out = ms.map((m) => (0, exports.pct)(total, m.percentBps));
    const drift = total - out.reduce((a, b) => a + b, 0);
    out[out.length - 1] += drift;
    return out;
}
