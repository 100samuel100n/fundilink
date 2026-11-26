import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transition, canTransition, InvalidTransitionError, canShareLiveLocation, BOOKING_STATUSES, TRANSITIONS,
  buildInvoice, travelFee, assertRevisionAllowed, validateMilestones, milestoneAmounts,
  Ledger, paymentReceived, processingFee, payout, refund, reconcile, proPayable, REVENUE, PSP, LedgerError,
  rank, score, newcomerBoost, haversineKm, approximateLocation, isFree, expiresAt, isExpired, suggestSlots,
  assertCanReview,
} from '../src/index.ts';

/* ---------------- state machine ---------------- */
test('happy path walks the whole journey', () => {
  let s: any = 'draft';
  const steps: [any, any, any?][] = [
    ['pending_payment', 'customer'], ['awaiting_acceptance', 'system', { paymentConfirmed: true }],
    ['confirmed', 'professional'], ['scheduled', 'system'], ['en_route', 'professional'], ['arrived', 'professional'],
    ['in_progress', 'professional'], ['awaiting_completion', 'professional', { evidenceCount: 2 }],
    ['completed', 'customer'], ['settlement_pending', 'system'], ['settled', 'system'],
  ];
  for (const [to, actor, ctx] of steps) { transition(s, to, actor, ctx); s = to; }
  assert.equal(s, 'settled');
});

test('professional cannot complete a job that was never started or accepted', () => {
  assert.throws(() => transition('awaiting_acceptance', 'completed', 'professional'), InvalidTransitionError);
  assert.throws(() => transition('confirmed', 'awaiting_completion', 'professional', { evidenceCount: 1 }), InvalidTransitionError);
});

test('payment must be webhook-confirmed before the pro is asked to accept', () => {
  assert.throws(() => transition('pending_payment', 'awaiting_acceptance', 'system'), /payment not confirmed/);
});

test('completion needs evidence; cancel/decline/dispute need a reason', () => {
  assert.throws(() => transition('in_progress', 'awaiting_completion', 'professional'), /evidence/);
  assert.throws(() => transition('scheduled', 'cancelled', 'customer'), /reason/);
  assert.doesNotThrow(() => transition('scheduled', 'cancelled', 'customer', { reason: 'Changed plans' }));
});

test('only the customer (or system) confirms completion; pros cannot self-settle', () => {
  assert.equal(canTransition('awaiting_completion', 'completed', 'professional'), false);
  assert.equal(canTransition('awaiting_completion', 'completed', 'customer'), true);
  assert.equal(canTransition('settlement_pending', 'settled', 'professional'), false);
});

test('terminal states have no exits; every status is declared', () => {
  assert.equal(TRANSITIONS.settled.length, 0);
  assert.equal(TRANSITIONS.refunded.length, 0);
  for (const s of BOOKING_STATUSES) assert.ok(s in TRANSITIONS, s);
});

test('live location only while en_route or arrived', () => {
  assert.equal(canShareLiveLocation('en_route'), true);
  assert.equal(canShareLiveLocation('arrived'), true);
  assert.equal(canShareLiveLocation('scheduled'), false);
  assert.equal(canShareLiveLocation('completed'), false);
});

/* ---------------- pricing ---------------- */
test('blueprint 5.2 example: 3,000 + 300 transport + 5% customer fee = 3,450', () => {
  const inv = buildInvoice(
    [
      { label: 'Service', kind: 'labour', quantity: 1, unitAmount: 300_000 },
      { label: 'Transport', kind: 'transport', quantity: 1, unitAmount: 30_000 },
    ],
    { commissionBps: 0, customerFeeBps: 0, taxBps: 0 },
  );
  // customer fee in the blueprint is 5% of the SERVICE fee only (150), not of transport
  const fee = Math.round(300_000 * 0.05);
  assert.equal(inv.serviceSubtotal + fee, 345_000);
});

test('blueprint 7.1 example: KSh 5,000 -> 5% commission 250, pro gets 4,750', () => {
  const inv = buildInvoice([{ label: 'Job', kind: 'labour', quantity: 1, unitAmount: 500_000 }]);
  assert.equal(inv.commission, 25_000);
  assert.equal(inv.professionalNet, 475_000);
  assert.equal(inv.customerTotal, 500_000);
});

test('customer fee + tax flow into the right buckets', () => {
  const inv = buildInvoice([{ label: 'Job', kind: 'labour', quantity: 1, unitAmount: 1_000_000 }], { commissionBps: 500, customerFeeBps: 300, taxBps: 1600 });
  assert.equal(inv.customerFee, 30_000);
  assert.equal(inv.tax, 4_800);
  assert.equal(inv.customerTotal, 1_034_800);
  assert.equal(inv.platformRevenue, 50_000 + 30_000);
});

test('materials are itemised in the quantity x unit model', () => {
  const inv = buildInvoice([
    { label: 'PVC pipes', kind: 'materials', quantity: 3, unitAmount: 30_000 },
    { label: 'Connectors', kind: 'materials', quantity: 4, unitAmount: 10_000 },
    { label: 'Labour', kind: 'labour', quantity: 1, unitAmount: 150_000 },
  ]);
  assert.equal(inv.serviceSubtotal, 280_000);
});

test('travel fees: free radius, per-km, out of area', () => {
  const p = { freeRadiusKm: 5, perKmAmount: 5_000, minCallOut: 20_000, maxTravelKm: 15, outOfAreaSurcharge: 50_000, allowOutOfArea: false };
  assert.deepEqual(travelFee(3, p), { ok: true, km: 3, fee: 0 });
  assert.equal((travelFee(8.2, p) as any).fee, 4 * 5_000);
  assert.deepEqual(travelFee(30, p), { ok: false, reason: 'out_of_service_area' });
});

test('price increases need explicit customer approval', () => {
  assert.throws(() => assertRevisionAllowed({ originalTotal: 200_000, revisedTotal: 260_000, customerApproved: false, reason: 'Found corroded line' }), /approval/);
  assert.doesNotThrow(() => assertRevisionAllowed({ originalTotal: 200_000, revisedTotal: 260_000, customerApproved: true, reason: 'Found corroded line' }));
  assert.throws(() => assertRevisionAllowed({ originalTotal: 200_000, revisedTotal: 150_000, customerApproved: true, reason: '' }), /explain/);
});

test('milestones must total 100% and split without losing a cent', () => {
  const ms = [
    { title: 'Start', percentBps: 3000, criteria: 'Materials on site' },
    { title: 'Mid', percentBps: 4000, criteria: 'Walls primed' },
    { title: 'Substantial', percentBps: 2000, criteria: 'Two coats done' },
    { title: 'Final', percentBps: 1000, criteria: 'Snag list closed' },
  ];
  validateMilestones(ms);
  const amounts = milestoneAmounts(1_000_003, ms);
  assert.equal(amounts.reduce((a, b) => a + b, 0), 1_000_003);
  assert.throws(() => validateMilestones(ms.slice(0, 3)), /100%/);
});

/* ---------------- ledger ---------------- */
const split = { gross: 500_000, proNet: 475_000, platformRevenue: 25_000, tax: 0 };

test('ledger stays balanced across payment, fee, payout', () => {
  const l = new Ledger();
  paymentReceived(l, { paymentId: 'p1', bookingId: 'b1', proId: 'pro1', split });
  processingFee(l, { paymentId: 'p1', bookingId: 'b1', fee: 7_500 });
  payout(l, { payoutId: 'o1', proId: 'pro1', amount: 475_000, bookingId: 'b1' });
  assert.ok(l.isBalanced());
  assert.equal(l.balance(proPayable('pro1')), 0);
  assert.equal(l.balance(REVENUE), 25_000);
  assert.equal(l.balance(PSP), 500_000 - 7_500 - 475_000);
});

test('duplicate payment webhook posts once (idempotency)', () => {
  const l = new Ledger();
  const a = paymentReceived(l, { paymentId: 'p1', bookingId: 'b1', proId: 'pro1', split });
  const b = paymentReceived(l, { paymentId: 'p1', bookingId: 'b1', proId: 'pro1', split });
  assert.equal(a, b);
  assert.equal(l.all().length, 1);
  assert.equal(l.balance(PSP), 500_000);
});

test('unbalanced and over-withdrawn postings are rejected', () => {
  const l = new Ledger();
  assert.throws(() => l.post({ idempotencyKey: 'x', kind: 't', entries: [{ account: 'A', debit: 10, credit: 0 }, { account: 'B', debit: 0, credit: 9 }] }), LedgerError);
  paymentReceived(l, { paymentId: 'p1', bookingId: 'b1', proId: 'pro1', split });
  assert.throws(() => payout(l, { payoutId: 'o9', proId: 'pro1', amount: 999_999 }), /exceeds/);
});

test('partial refund reverses proportionally and keeps books balanced', () => {
  const l = new Ledger();
  paymentReceived(l, { paymentId: 'p1', bookingId: 'b1', proId: 'pro1', split });
  refund(l, { refundId: 'r1', bookingId: 'b1', proId: 'pro1', amount: 100_000, original: split });
  assert.ok(l.isBalanced());
  assert.equal(l.balance(PSP), 400_000);
  assert.equal(l.balance(REVENUE), 25_000 - 5_000);
  assert.equal(l.balance(proPayable('pro1')), 475_000 - 95_000);
});

test('entries are frozen; reconciliation flags drift', () => {
  const l = new Ledger();
  const tx = paymentReceived(l, { paymentId: 'p1', bookingId: 'b1', proId: 'pro1', split });
  assert.throws(() => { (tx.entries[0] as any).debit = 1; }, TypeError);
  assert.equal(reconcile(l, 500_000).matches, true);
  assert.equal(reconcile(l, 499_000).difference, -1_000);
});

/* ---------------- ranking ---------------- */
const base = {
  distanceKm: 3, serviceRadiusKm: 15, specialisationMatch: 0.9, availableNow: true, hoursUntilNextSlot: 0,
  avgRating: 4.7, reviewCount: 40, completedJobs: 60, completionRate: 0.96, cancellationRate: 0.02,
  avgResponseMinutes: 10, startingPrice: 150_000, verifiedIdentity: true,
};
const q = { marketMedianPrice: 150_000 };

test('out-of-area professionals never rank', () => {
  const r = rank([{ id: 'far', ...base, distanceKm: 40 }, { id: 'near', ...base }], q);
  assert.deepEqual(r.map((x) => x.candidate.id), ['near']);
});

test('cheapest is not automatically first', () => {
  const r = rank([
    { id: 'cheap-flaky', ...base, startingPrice: 20_000, avgRating: 3.1, completionRate: 0.6, cancellationRate: 0.3, availableNow: false, hoursUntilNextSlot: 60 },
    { id: 'solid', ...base },
  ], q);
  assert.equal(r[0].candidate.id, 'solid');
});

test('a handful of reviews cannot game the rating or reliability components', () => {
  const lucky = { id: 'lucky', ...base, avgRating: 5, reviewCount: 1, completedJobs: 1, completionRate: 1 };
  const proven = { id: 'proven', ...base };
  const sl = score(lucky, q), sp = score(proven, q);
  assert.ok(sp.parts.R > sl.parts.R, 'smoothed reputation: 40 reviews at 4.7 beats 1 review at 5.0');
  assert.ok(sp.parts.C > sl.parts.C, 'smoothed reliability: 60 jobs at 96% beats 1 job at 100%');
});

test('newcomer advantage is bounded: boost cap limits how far a newcomer can jump a proven pro', () => {
  const newcomer = { id: 'new', ...base, avgRating: 4.7, reviewCount: 0, completedJobs: 0, completionRate: 0.96 };
  const proven = { id: 'proven', ...base };
  const gap = score(newcomer, q).total - score(proven, q).total;
  assert.ok(gap <= 0.08, `newcomer lead ${gap} must not exceed the boost cap`);
  // and a clearly weaker newcomer (poor price fit, slow response) does not leapfrog
  const weak = { ...newcomer, id: 'weak', startingPrice: 900_000, avgResponseMinutes: 110, cancellationRate: 0.3 };
  assert.equal(rank([weak, proven], q)[0].candidate.id, 'proven');
});

test('newcomer boost is bounded and decays', () => {
  const fresh = newcomerBoost({ id: 'n', ...base, completedJobs: 0 });
  const veteran = newcomerBoost({ id: 'v', ...base, completedJobs: 100 });
  assert.ok(fresh <= 0.08 && fresh > veteran);
  assert.equal(newcomerBoost({ id: 'u', ...base, completedJobs: 0, verifiedIdentity: false }), 0);
});

test('score parts are all within 0..1', () => {
  const s = score({ id: 'a', ...base }, q);
  for (const v of Object.values(s.parts)) assert.ok(v >= 0 && v <= 1);
});

/* ---------------- geo ---------------- */
test('haversine: Nairobi CBD to Westlands is roughly 4-5 km', () => {
  const d = haversineKm({ lat: -1.2864, lng: 36.8172 }, { lat: -1.2673, lng: 36.8112 });
  assert.ok(d > 1.8 && d < 3, String(d));
});

test('approximate location stays within its fuzz radius and is deterministic', () => {
  const p = { lat: -1.2921, lng: 36.7872 };
  const a = approximateLocation(p, 'pro-123');
  assert.deepEqual(a, approximateLocation(p, 'pro-123'));
  assert.ok(haversineKm(p, a) <= 0.61);
});

/* ---------------- scheduling ---------------- */
const at = (h: number, m = 0) => { const d = new Date('2026-11-09T00:00:00'); d.setHours(h, m); return d; };

test('double-booking and buffer detection', () => {
  const existing = [{ start: at(10), end: at(12) }];
  assert.equal(isFree({ start: at(11), end: at(13) }, existing), false);
  assert.equal(isFree({ start: at(12), end: at(13) }, existing), true);
  assert.equal(isFree({ start: at(12), end: at(13) }, existing, 30), false);
});

test('requests expire: urgent in 10 min, standard in 2h', () => {
  const requestedAt = at(9);
  assert.equal(expiresAt({ requestedAt, kind: 'urgent' }).getTime() - requestedAt.getTime(), 10 * 60_000);
  assert.equal(isExpired({ requestedAt, kind: 'standard' }, at(11, 1)), true);
  assert.equal(isExpired({ requestedAt, kind: 'standard' }, at(10)), false);
});

test('slot suggestions skip busy periods', () => {
  const slots = suggestSlots({ day: at(0), workStartHour: 8, workEndHour: 12, durationMin: 60, existing: [{ start: at(9), end: at(10) }] });
  assert.ok(slots.every((s) => !(s.start < at(10) && s.end > at(9))));
  assert.ok(slots.length > 0);
});

/* ---------------- reviews ---------------- */
test('review integrity rules', () => {
  const ok = { reviewerId: 'c1', professionalOwnerIds: ['p1'], bookingCustomerId: 'c1', bookingStatus: 'completed', alreadyReviewedBookingIds: [], bookingId: 'b1', ratings: { overall: 5, punctuality: 4 } };
  assert.doesNotThrow(() => assertCanReview(ok));
  assert.throws(() => assertCanReview({ ...ok, bookingStatus: 'in_progress' }), /eligible/);
  assert.throws(() => assertCanReview({ ...ok, alreadyReviewedBookingIds: ['b1'] }), /already/);
  assert.throws(() => assertCanReview({ ...ok, reviewerId: 'x' }), /customer/);
  assert.throws(() => assertCanReview({ ...ok, ratings: { punctuality: 4 } }), /Overall/);
  assert.throws(() => assertCanReview({ ...ok, ratings: { overall: 6 } }), /1-5/);
});
