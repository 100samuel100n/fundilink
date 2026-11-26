/**
 * Booking state machine. The API and the DB both enforce this; the UI only reflects it.
 * Invalid transitions throw. Every accepted transition returns a history row to persist.
 */
export declare const BOOKING_STATUSES: readonly ["draft", "pending_payment", "awaiting_acceptance", "confirmed", "declined", "scheduled", "en_route", "arrived", "in_progress", "awaiting_completion", "completed", "disputed", "cancelled", "refunded", "partially_refunded", "settlement_pending", "settled"];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type Actor = 'customer' | 'professional' | 'admin' | 'system';
export interface TransitionRule {
    to: BookingStatus;
    actors: Actor[];
}
export declare const TRANSITIONS: Record<BookingStatus, TransitionRule[]>;
export interface TransitionContext {
    /** number of completion-evidence attachments (photos/videos) */
    evidenceCount?: number;
    paymentConfirmed?: boolean;
    /** direct (pay-on-site) bookings skip online payment: the customer pays the professional on the day */
    payOnSite?: boolean;
    /** required text for cancellations, disputes, declines */
    reason?: string;
}
export declare class InvalidTransitionError extends Error {
    from: BookingStatus;
    to: BookingStatus;
    constructor(from: BookingStatus, to: BookingStatus, detail: string);
}
export interface HistoryRow {
    from: BookingStatus;
    to: BookingStatus;
    actor: Actor;
    reason?: string;
    at: Date;
}
export declare function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean;
export declare function transition(from: BookingStatus, to: BookingStatus, actor: Actor, ctx?: TransitionContext, now?: Date): HistoryRow;
export declare const TERMINAL: BookingStatus[];
export declare const isTerminal: (s: BookingStatus) => boolean;
/** Statuses during which live journey sharing is allowed (customer may see pro location). */
export declare const TRACKING_STATUSES: BookingStatus[];
export declare const canShareLiveLocation: (s: BookingStatus) => boolean;
