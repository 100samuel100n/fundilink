export interface Slot { start: Date; end: Date }

export const overlaps = (a: Slot, b: Slot) => a.start < b.end && b.start < a.end;

export const withBuffer = (s: Slot, bufferMin: number): Slot => ({
  start: new Date(s.start.getTime() - bufferMin * 60_000),
  end: new Date(s.end.getTime() + bufferMin * 60_000),
});

/**
 * First-line check used for UX. The DB exclusion constraint on (professional_id, tstzrange)
 * is the real guarantee against double-booking.
 */
export function isFree(candidate: Slot, existing: Slot[], bufferMin = 0) {
  const padded = withBuffer(candidate, bufferMin);
  return !existing.some((e) => overlaps(padded, e));
}

export interface BookingRequestWindow {
  requestedAt: Date;
  kind: 'standard' | 'urgent' | 'quotation';
}

export const RESPONSE_WINDOW_MIN: Record<BookingRequestWindow['kind'], number> = {
  standard: 120,
  urgent: 10,
  quotation: 60 * 48,
};

export const expiresAt = (w: BookingRequestWindow, windows = RESPONSE_WINDOW_MIN) =>
  new Date(w.requestedAt.getTime() + windows[w.kind] * 60_000);

export const isExpired = (w: BookingRequestWindow, now = new Date()) => now >= expiresAt(w);

/** Next N free start times inside working hours, for the booking wizard. */
export function suggestSlots(opts: {
  day: Date;
  workStartHour: number;
  workEndHour: number;
  durationMin: number;
  existing: Slot[];
  bufferMin?: number;
  stepMin?: number;
  limit?: number;
}): Slot[] {
  const { day, workStartHour, workEndHour, durationMin, existing, bufferMin = 0, stepMin = 30, limit = 8 } = opts;
  const out: Slot[] = [];
  const start = new Date(day); start.setHours(workStartHour, 0, 0, 0);
  const end = new Date(day); end.setHours(workEndHour, 0, 0, 0);
  for (let t = start.getTime(); t + durationMin * 60_000 <= end.getTime() && out.length < limit; t += stepMin * 60_000) {
    const slot = { start: new Date(t), end: new Date(t + durationMin * 60_000) };
    if (isFree(slot, existing, bufferMin)) out.push(slot);
  }
  return out;
}
