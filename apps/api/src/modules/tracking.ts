import { Controller, ForbiddenException, Get, Injectable, NotFoundException, Param } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { canShareLiveLocation, etaMinutes, haversineKm, roadKmEstimate, thinRoute } from '@fundilink/domain';
import { AuthUser, CurrentUser, Db, corsOptions } from '../common/core.ts';
import { Maps } from '../providers/providers.ts';
import { BookingService } from './bookings.ts';

/**
 * Live journey: the professional streams position ONLY while a booking is en_route/arrived.
 * Customers see the moving pin, the colour-highlighted route and a live ETA. Nothing is exposed otherwise,
 * and points are purged after completion (tracking.retention_hours).
 */
@WebSocketGateway({ namespace: '/tracking', cors: corsOptions })
@Injectable()
export class TrackingGateway implements OnGatewayConnection {
  @WebSocketServer() io!: Server;
  constructor(private db: Db, private jwt: JwtService, private bookings: BookingService, private maps: Maps) {
    this.bookings.onStatus = (id, status) => this.statusChanged(id, status);
  }

  async handleConnection(s: Socket) {
    try {
      const p = await this.jwt.verifyAsync(String(s.handshake.auth?.token ?? ''), { secret: process.env.JWT_ACCESS_SECRET });
      s.data.user = { id: p.sub, roles: p.roles ?? [], perms: p.perms ?? [] } as AuthUser;
    } catch { s.disconnect(true); }
  }

  /** Customer (or the pro) subscribes to one booking's journey. */
  @SubscribeMessage('watch')
  async watch(@ConnectedSocket() s: Socket, @MessageBody() d: { bookingId: string }) {
    const b = await this.db.one<any>('SELECT * FROM bookings WHERE id=$1', [d.bookingId]);
    if (!b || !(await this.bookings.sideOf(b, s.data.user.id))) throw new ForbiddenException();
    await s.join(`booking:${b.id}`);
    const last = await this.db.one<any>(`SELECT ST_Y(location::geometry) lat, ST_X(location::geometry) lng, heading, speed_kmh FROM booking_tracking_points WHERE booking_id=$1 ORDER BY id DESC LIMIT 1`, [b.id]);
    return { status: b.status, last: canShareLiveLocation(b.status) ? last ?? null : null };
  }

  /** Pro device pushes a GPS fix every ~3-5 s while travelling. */
  @SubscribeMessage('position')
  async position(@ConnectedSocket() s: Socket, @MessageBody() d: { bookingId: string; lat: number; lng: number; heading?: number; speedKmh?: number }) {
    const b = await this.db.one<any>('SELECT *, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM bookings WHERE id=$1', [d.bookingId]);
    if (!b || (await this.bookings.sideOf(b, s.data.user.id)) !== 'professional') throw new ForbiddenException();
    if (!canShareLiveLocation(b.status)) return { ignored: true }; // sharing stops automatically when the journey ends
    await this.db.query(`INSERT INTO booking_tracking_points (booking_id, location, heading, speed_kmh) VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4, $5)`, [b.id, d.lng, d.lat, d.heading ?? null, d.speedKmh ?? null]);
    const km = haversineKm({ lat: d.lat, lng: d.lng }, { lat: b.lat, lng: b.lng });
    const eta = etaMinutes(roadKmEstimate(km), d.speedKmh && d.speedKmh > 8 ? d.speedKmh : 22);
    this.io.to(`booking:${b.id}`).emit('position', { lat: d.lat, lng: d.lng, heading: d.heading ?? null, speedKmh: d.speedKmh ?? null, remainingKm: Number(km.toFixed(2)), etaMinutes: eta, nearby: km < 0.4, at: Date.now() });
    return { ok: true };
  }

  /** Server-side broadcast used by REST transitions so both apps update instantly. */
  statusChanged(bookingId: string, status: string) { this.io?.to(`booking:${bookingId}`).emit('status', { status }); }
}

@Controller('bookings')
export class TrackingController {
  constructor(private db: Db, private bookings: BookingService, private maps: Maps) {}

  /** Planned route (polyline to highlight) + the already-travelled trail. */
  @Get(':id/journey')
  async journey(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const b = await this.db.one<any>('SELECT *, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM bookings WHERE id=$1', [id]);
    if (!b) throw new NotFoundException();
    if (!(await this.bookings.sideOf(b, u.id))) throw new ForbiddenException();
    if (!canShareLiveLocation(b.status)) return { active: false };
    const pts = await this.db.query<any>(`SELECT ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM booking_tracking_points WHERE booking_id=$1 ORDER BY id`, [id]);
    const trail = thinRoute(pts);
    const here = pts[pts.length - 1];
    const planned = here ? await this.maps.route(here, { lat: b.lat, lng: b.lng }) : null;
    return { active: true, destination: { lat: b.lat, lng: b.lng }, trail, plannedRoute: planned?.coordinates ?? (here ? [here, { lat: b.lat, lng: b.lng }] : []), etaMinutes: planned?.durationMin ?? null };
  }
}
