import { BadRequestException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post } from '@nestjs/common';
import { haversineKm } from '@fundilink/domain';
import { AuthUser, CurrentUser, Db, Public } from '../common/core.ts';
import { Maps } from '../providers/providers.ts';
import { BookingService } from './bookings.ts';
import { DEMO_PASSWORD, DEMO_USERS } from '../demo-data.ts';

const on = () => process.env.ENABLE_DEMO === 'true';

/**
 * Testing helpers. Everything here refuses to run unless ENABLE_DEMO=true.
 *  - /demo/accounts           public list of seeded logins (so the sign-in screens can offer one-tap fills)
 *  - /demo/bookings/:id/journey-plan   start point + road route for the in-app "drive simulator"
 *  - /demo/bookings/:id/reset          put a booking back to "scheduled" so you can replay the en-route flow
 */
@Controller('demo')
@Injectable()
export class DemoController {
  constructor(private db: Db, private maps: Maps, private bookings: BookingService) {}

  @Public() @Get('accounts')
  async accounts() {
    if (!on()) return [];
    const present = await this.db.query<{ email: string }>('SELECT email FROM users WHERE is_demo');
    const have = new Set(present.map((p) => p.email));
    const label: Record<string, string> = { admin: 'Admin', customer: 'Customer', professional: 'Professional', org: 'Enterprise manager', tech: 'Technician' };
    return DEMO_USERS.filter((u) => have.has(u.email)).map((u) => ({ role: u.role, label: `${label[u.role]}: ${u.name}`, identifier: u.email, password: DEMO_PASSWORD, note: u.note }));
  }

  private async load(u: AuthUser, id: string) {
    if (!on()) throw new ForbiddenException('Demo mode is off');
    const b = await this.db.one<any>('SELECT *, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM bookings WHERE id=$1', [id]);
    if (!b) throw new NotFoundException();
    const side = await this.bookings.sideOf(b, u.id);
    if (!side && !u.perms.includes('*')) throw new ForbiddenException();
    return b;
  }

  @Get('bookings/:id/journey-plan')
  async plan(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const b = await this.load(u, id);
    const dest = { lat: Number(b.lat), lng: Number(b.lng) };
    const pro = await this.db.one<any>('SELECT ST_Y(base_location::geometry) lat, ST_X(base_location::geometry) lng FROM professional_profiles WHERE id=$1', [b.professional_id]);
    let start = pro ? { lat: Number(pro.lat), lng: Number(pro.lng) } : null;
    // Keep the demo drive watchable: between 1.5 km and 12 km. Otherwise start 4 km south-west of the job.
    const d = start ? haversineKm(start, dest) : 0;
    if (!start || d < 1.5 || d > 12) start = { lat: dest.lat - 0.028, lng: dest.lng - 0.026 };
    const r = await this.maps.route(start, dest).catch(() => null);
    const route = r?.coordinates?.length ? r.coordinates : bend(start, dest, 70);
    return { start, destination: dest, route, etaMinutes: r?.durationMin ?? Math.max(2, Math.round((haversineKm(start, dest) * 1.35 / 24) * 60)), source: r ? 'mapbox' : 'estimated' };
  }

  @Post('bookings/:id/reset')
  async reset(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const b = await this.load(u, id);
    if (['pending_payment', 'awaiting_acceptance', 'declined', 'cancelled', 'refunded'].includes(b.status)) throw new BadRequestException('This booking has not been accepted yet, so there is nothing to reset.');
    await this.db.tx(async (c) => {
      await c.query(`DELETE FROM booking_tracking_points WHERE booking_id=$1`, [id]);
      await c.query(`UPDATE bookings SET status='scheduled', start_pin_hash=NULL, arrived_at=NULL, completed_at=NULL, updated_at=now() WHERE id=$1`, [id]);
      await c.query(`INSERT INTO booking_status_history (booking_id, from_status, to_status, actor, actor_user_id, reason) VALUES ($1,$2,'scheduled','system',$3,'Demo reset')`, [id, b.status, u.id]);
    });
    this.bookings.onStatus?.(id, 'scheduled');
    return { ok: true, status: 'scheduled' };
  }
}

/** A gentle S-curve between two points, so the straight-line fallback still looks like a road. */
export function bend(a: { lat: number; lng: number }, b: { lat: number; lng: number }, n: number) {
  const dx = b.lng - a.lng, dy = b.lat - a.lat, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, w = Math.sin(t * Math.PI * 2) * 0.12 * len * (1 - Math.abs(0.5 - t));
    return { lat: a.lat + dy * t + py * w, lng: a.lng + dx * t + px * w };
  });
}
