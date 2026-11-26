import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStage, locationFreshness, describeEta, acceptGpsFix, buildTimeline, journeyMessage, ageLabel } from '../../sdk/src/journey.ts';

const NOW = 1_700_000_000_000;

test('stage follows booking status', () => {
  assert.equal(deriveStage({ status: 'cancelled' }), 'cancelled');
  assert.equal(deriveStage({ status: 'completed' }), 'completed');
  assert.equal(deriveStage({ status: 'in_progress' }), 'working');
  assert.equal(deriveStage({ status: 'arrived' }), 'arrived');
  assert.equal(deriveStage({ status: 'awaiting_acceptance' }), 'requested');
});
test('confirmed becomes preparing inside the hour before start', () => {
  assert.equal(deriveStage({ status: 'confirmed', startsAt: NOW + 3 * 3_600_000, now: NOW }), 'confirmed');
  assert.equal(deriveStage({ status: 'scheduled', startsAt: NOW + 30 * 60_000, now: NOW }), 'preparing');
});
test('enroute becomes approaching from real data only', () => {
  assert.equal(deriveStage({ status: 'en_route', etaMinutes: 18, remainingKm: 6 }), 'enroute');
  assert.equal(deriveStage({ status: 'en_route', etaMinutes: 4 }), 'approaching');
  assert.equal(deriveStage({ status: 'en_route', remainingKm: 0.6 }), 'approaching');
  assert.equal(deriveStage({ status: 'en_route', nearby: true }), 'approaching');
  assert.equal(deriveStage({ status: 'en_route' }), 'enroute');
});
test('a position older than 90 s is never live', () => {
  assert.equal(locationFreshness(NOW - 10_000, NOW), 'live');
  assert.equal(locationFreshness(NOW - 60_000, NOW), 'delayed');
  assert.equal(locationFreshness(NOW - 91_000, NOW), 'stale');
  assert.equal(locationFreshness(null, NOW), 'none');
  assert.equal(ageLabel(NOW - 45_000, NOW), 'Updated 45s ago');
});
test('eta confidence drops with stale or stopped fixes', () => {
  const live = describeEta({ etaMinutes: 10, fixAt: NOW - 5000, speedKmh: 30, accuracyM: 10, now: NOW });
  assert.equal(live.confidence, 'high'); assert.equal(live.label, '10 min away');
  const stale = describeEta({ etaMinutes: 10, fixAt: NOW - 120_000, now: NOW });
  assert.equal(stale.confidence, 'low'); assert.ok(stale.window![1] - stale.window![0] >= 4);
  const stopped = describeEta({ etaMinutes: 10, fixAt: NOW - 5000, speedKmh: 0, now: NOW });
  assert.equal(stopped.stopped, true); assert.equal(stopped.confidence, 'medium');
  assert.equal(describeEta({ etaMinutes: null, fixAt: null, now: NOW }).label, 'Waiting for location');
});
test('gps filter drops inaccurate fixes, teleports and noise', () => {
  const a = { lat: -1.2921, lng: 36.8219, at: NOW };
  assert.equal(acceptGpsFix(null, a), true);
  assert.equal(acceptGpsFix(a, { lat: -1.2921, lng: 36.8219, at: NOW + 4000 }), false); // no movement
  assert.equal(acceptGpsFix(a, { lat: -1.2950, lng: 36.8250, at: NOW + 20_000 }), true); // ~0.5 km in 20 s = 90 km/h ok
  assert.equal(acceptGpsFix(a, { lat: -1.30, lng: 36.83, at: NOW + 4000, accuracyM: 400 }), false); // inaccurate
  assert.equal(acceptGpsFix(a, { lat: -1.40, lng: 36.95, at: NOW + 4000 }), false); // teleport
  assert.equal(acceptGpsFix(a, { lat: NaN, lng: 36.8, at: NOW + 4000 }), false);
});
test('timeline uses audit timestamps and actors', () => {
  const t = buildTimeline('enroute', [{ to_status: 'confirmed', actor: 'professional', created_at: 'c' }, { to_status: 'en_route', actor: 'professional', created_at: 'e' }]);
  assert.deepEqual(t.map((x) => x.state), ['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(t[0].at, 'c'); assert.equal(t[2].at, 'e'); assert.equal(t[2].actor, 'professional');
  assert.equal(buildTimeline('cancelled', [])[0].label, 'Cancelled');
});
test('messages come from data', () => {
  assert.equal(journeyMessage('approaching', 'customer', { etaMinutes: 5, fresh: 'live' }), 'Your professional is approximately 5 min away');
  assert.equal(journeyMessage('enroute', 'customer', { fresh: 'stale', etaMinutes: 9 }), 'Showing your professional’s last known location');
  assert.equal(journeyMessage('arrived', 'customer'), 'Your professional has arrived');
});
