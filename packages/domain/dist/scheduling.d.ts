export interface Slot {
    start: Date;
    end: Date;
}
export declare const overlaps: (a: Slot, b: Slot) => boolean;
export declare const withBuffer: (s: Slot, bufferMin: number) => Slot;
/**
 * First-line check used for UX. The DB exclusion constraint on (professional_id, tstzrange)
 * is the real guarantee against double-booking.
 */
export declare function isFree(candidate: Slot, existing: Slot[], bufferMin?: number): boolean;
export interface BookingRequestWindow {
    requestedAt: Date;
    kind: 'standard' | 'urgent' | 'quotation';
}
export declare const RESPONSE_WINDOW_MIN: Record<BookingRequestWindow['kind'], number>;
export declare const expiresAt: (w: BookingRequestWindow, windows?: Record<"quotation" | "standard" | "urgent", number>) => Date;
export declare const isExpired: (w: BookingRequestWindow, now?: Date) => boolean;
/** Next N free start times inside working hours, for the booking wizard. */
export declare function suggestSlots(opts: {
    day: Date;
    workStartHour: number;
    workEndHour: number;
    durationMin: number;
    existing: Slot[];
    bufferMin?: number;
    stepMin?: number;
    limit?: number;
}): Slot[];
