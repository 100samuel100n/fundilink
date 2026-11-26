"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canShareLiveLocation = exports.TRACKING_STATUSES = exports.isTerminal = exports.TERMINAL = exports.InvalidTransitionError = exports.TRANSITIONS = exports.BOOKING_STATUSES = void 0;
exports.canTransition = canTransition;
exports.transition = transition;
/**
 * Booking state machine. The API and the DB both enforce this; the UI only reflects it.
 * Invalid transitions throw. Every accepted transition returns a history row to persist.
 */
exports.BOOKING_STATUSES = [
    'draft',
    'pending_payment',
    'awaiting_acceptance',
    'confirmed',
    'declined',
    'scheduled',
    'en_route',
    'arrived',
    'in_progress',
    'awaiting_completion',
    'completed',
    'disputed',
    'cancelled',
    'refunded',
    'partially_refunded',
    'settlement_pending',
    'settled',
];
const T = (to, ...actors) => ({ to, actors });
exports.TRANSITIONS = {
    draft: [T('pending_payment', 'customer'), T('cancelled', 'customer', 'system')],
    pending_payment: [T('awaiting_acceptance', 'system'), T('cancelled', 'customer', 'system')],
    awaiting_acceptance: [
        T('confirmed', 'professional', 'system'), // system = auto-accept rules
        T('declined', 'professional'),
        T('cancelled', 'customer', 'system'), // system = request expiry
    ],
    confirmed: [T('scheduled', 'system'), T('en_route', 'professional'), T('cancelled', 'customer', 'professional', 'admin')],
    scheduled: [T('en_route', 'professional'), T('cancelled', 'customer', 'professional', 'admin')],
    en_route: [T('arrived', 'professional'), T('cancelled', 'customer', 'professional', 'admin')],
    arrived: [T('in_progress', 'professional'), T('cancelled', 'customer', 'professional', 'admin')],
    in_progress: [T('awaiting_completion', 'professional'), T('disputed', 'customer', 'professional')],
    awaiting_completion: [
        T('completed', 'customer', 'system'), // system = auto-confirm after review window
        T('disputed', 'customer', 'professional'),
    ],
    completed: [T('settlement_pending', 'system'), T('disputed', 'customer')],
    settlement_pending: [T('settled', 'system', 'admin'), T('disputed', 'customer', 'admin')],
    disputed: [
        T('completed', 'admin'),
        T('refunded', 'admin'),
        T('partially_refunded', 'admin'),
        T('cancelled', 'admin'),
    ],
    declined: [T('refunded', 'system')],
    cancelled: [T('refunded', 'system'), T('partially_refunded', 'system')],
    partially_refunded: [T('settlement_pending', 'system')],
    refunded: [],
    settled: [],
};
class InvalidTransitionError extends Error {
    from;
    to;
    constructor(from, to, detail) {
        super(`Invalid booking transition ${from} -> ${to}: ${detail}`);
        this.name = 'InvalidTransitionError';
        this.from = from;
        this.to = to;
    }
}
exports.InvalidTransitionError = InvalidTransitionError;
const REASON_REQUIRED = ['cancelled', 'declined', 'disputed'];
function canTransition(from, to, actor) {
    return exports.TRANSITIONS[from].some((r) => r.to === to && r.actors.includes(actor));
}
function transition(from, to, actor, ctx = {}, now = new Date()) {
    const rule = exports.TRANSITIONS[from].find((r) => r.to === to);
    if (!rule)
        throw new InvalidTransitionError(from, to, 'no such transition');
    if (!rule.actors.includes(actor)) {
        throw new InvalidTransitionError(from, to, `${actor} is not allowed to do this`);
    }
    if (from === 'pending_payment' && to === 'awaiting_acceptance' && !ctx.paymentConfirmed && !ctx.payOnSite) {
        throw new InvalidTransitionError(from, to, 'payment not confirmed by verified webhook');
    }
    if (to === 'awaiting_completion' && (ctx.evidenceCount ?? 0) < 1) {
        throw new InvalidTransitionError(from, to, 'completion evidence is required');
    }
    if (REASON_REQUIRED.includes(to) && !ctx.reason?.trim()) {
        throw new InvalidTransitionError(from, to, 'a reason is required');
    }
    return { from, to, actor, reason: ctx.reason, at: now };
}
exports.TERMINAL = ['refunded', 'settled'];
const isTerminal = (s) => exports.TERMINAL.includes(s);
exports.isTerminal = isTerminal;
/** Statuses during which live journey sharing is allowed (customer may see pro location). */
exports.TRACKING_STATUSES = ['en_route', 'arrived'];
const canShareLiveLocation = (s) => exports.TRACKING_STATUSES.includes(s);
exports.canShareLiveLocation = canShareLiveLocation;
