"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpired = exports.expiresAt = exports.RESPONSE_WINDOW_MIN = exports.withBuffer = exports.overlaps = void 0;
exports.isFree = isFree;
exports.suggestSlots = suggestSlots;
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
exports.overlaps = overlaps;
const withBuffer = (s, bufferMin) => ({
    start: new Date(s.start.getTime() - bufferMin * 60_000),
    end: new Date(s.end.getTime() + bufferMin * 60_000),
});
exports.withBuffer = withBuffer;
/**
 * First-line check used for UX. The DB exclusion constraint on (professional_id, tstzrange)
 * is the real guarantee against double-booking.
 */
function isFree(candidate, existing, bufferMin = 0) {
    const padded = (0, exports.withBuffer)(candidate, bufferMin);
    return !existing.some((e) => (0, exports.overlaps)(padded, e));
}
exports.RESPONSE_WINDOW_MIN = {
    standard: 120,
    urgent: 10,
    quotation: 60 * 48,
};
const expiresAt = (w, windows = exports.RESPONSE_WINDOW_MIN) => new Date(w.requestedAt.getTime() + windows[w.kind] * 60_000);
exports.expiresAt = expiresAt;
const isExpired = (w, now = new Date()) => now >= (0, exports.expiresAt)(w);
exports.isExpired = isExpired;
/** Next N free start times inside working hours, for the booking wizard. */
function suggestSlots(opts) {
    const { day, workStartHour, workEndHour, durationMin, existing, bufferMin = 0, stepMin = 30, limit = 8 } = opts;
    const out = [];
    const start = new Date(day);
    start.setHours(workStartHour, 0, 0, 0);
    const end = new Date(day);
    end.setHours(workEndHour, 0, 0, 0);
    for (let t = start.getTime(); t + durationMin * 60_000 <= end.getTime() && out.length < limit; t += stepMin * 60_000) {
        const slot = { start: new Date(t), end: new Date(t + durationMin * 60_000) };
        if (isFree(slot, existing, bufferMin))
            out.push(slot);
    }
    return out;
}
