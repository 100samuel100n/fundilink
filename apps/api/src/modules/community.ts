import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Param, Post, Put, Query } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { assertCanReview } from '@fundilink/domain';
import { AuthUser, CurrentUser, Db, parse, corsOptions } from '../common/core.ts';
import { BookingService } from './bookings.ts';

/* ===================== Messaging ===================== */
@Injectable()
export class MessagingService {
  constructor(private db: Db, private bookings: BookingService) {}

  /** Conversations exist once a booking/quotation is initiated: no cold-messaging professionals. */
  async forBooking(u: AuthUser, bookingId: string) {
    const b = await this.db.one<any>('SELECT * FROM bookings WHERE id=$1', [bookingId]);
    if (!b || !(await this.bookings.sideOf(b, u.id))) throw new ForbiddenException();
    let conv = await this.db.one<any>('SELECT * FROM conversations WHERE booking_id=$1', [bookingId]);
    if (!conv) {
      conv = await this.db.one<any>(`INSERT INTO conversations (booking_id) VALUES ($1) RETURNING *`, [bookingId]);
      const pro = await this.db.one<any>('SELECT user_id FROM professional_profiles WHERE id=$1', [b.professional_id]);
      for (const uid of [b.customer_id, pro.user_id]) await this.db.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [conv.id, uid]);
    }
    return conv;
  }

  async assertMember(userId: string, conversationId: string) {
    const m = await this.db.one<any>('SELECT blocked FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [conversationId, userId]);
    if (!m) throw new ForbiddenException();
  }

  async send(u: AuthUser, conversationId: string, body: string, attachments: { key: string; mime: string; size: number }[] = []) {
    await this.assertMember(u.id, conversationId);
    const blocked = await this.db.one('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND blocked', [conversationId]);
    if (blocked) throw new ForbiddenException('This conversation is blocked');
    const m = await this.db.one<any>('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *', [conversationId, u.id, body]);
    for (const a of attachments) await this.db.query('INSERT INTO message_attachments (message_id, storage_key, mime, size_bytes) VALUES ($1,$2,$3,$4)', [m.id, a.key, a.mime, a.size]);
    return m;
  }

  async history(u: AuthUser, conversationId: string) {
    await this.assertMember(u.id, conversationId);
    return this.db.query('SELECT m.*, (SELECT json_agg(a) FROM message_attachments a WHERE a.message_id=m.id) attachments FROM messages m WHERE conversation_id=$1 ORDER BY created_at LIMIT 500', [conversationId]);
  }
}

@WebSocketGateway({ namespace: '/chat', cors: corsOptions })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() io!: Server;
  constructor(private jwt: JwtService, private s: MessagingService, private db: Db) {}
  async handleConnection(sock: Socket) {
    try { const p = await this.jwt.verifyAsync(String(sock.handshake.auth?.token ?? ''), { secret: process.env.JWT_ACCESS_SECRET }); sock.data.user = { id: p.sub, roles: [], perms: [] }; }
    catch { sock.disconnect(true); }
  }
  @SubscribeMessage('join') async join(@ConnectedSocket() s: Socket, @MessageBody() d: { conversationId: string }) { await this.s.assertMember(s.data.user.id, d.conversationId); await s.join(d.conversationId); return { ok: true }; }
  @SubscribeMessage('message') async message(@ConnectedSocket() s: Socket, @MessageBody() d: { conversationId: string; body: string }) {
    const m = await this.s.send(s.data.user, d.conversationId, String(d.body).slice(0, 4000));
    this.io.to(d.conversationId).emit('message', m);
    return m;
  }
  @SubscribeMessage('typing') typing(@ConnectedSocket() s: Socket, @MessageBody() d: { conversationId: string }) { s.to(d.conversationId).emit('typing', { userId: s.data.user.id }); }
  @SubscribeMessage('read') async read(@ConnectedSocket() s: Socket, @MessageBody() d: { conversationId: string }) {
    await this.db.query('UPDATE conversation_members SET last_read_at=now() WHERE conversation_id=$1 AND user_id=$2', [d.conversationId, s.data.user.id]);
    s.to(d.conversationId).emit('read', { userId: s.data.user.id, at: Date.now() });
  }
}

@Controller('messages')
export class MessagingController {
  constructor(private s: MessagingService, private db: Db) {}
  @Post('booking/:id') open(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.forBooking(u, id); }
  @Get('conversation/:id') history(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.history(u, id); }
  @Post('conversation/:id') send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ body: z.string().min(1).max(4000), attachments: z.array(z.object({ key: z.string(), mime: z.string(), size: z.number() })).default([]) }), b);
    return this.s.send(u, id, i.body, i.attachments);
  }
  @Post('conversation/:id/block') async block(@CurrentUser() u: AuthUser, @Param('id') id: string) { await this.s.assertMember(u.id, id); await this.db.query('UPDATE conversation_members SET blocked=true WHERE conversation_id=$1 AND user_id=$2', [id, u.id]); return { ok: true }; }
  @Post('report') async report(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ targetKind: z.enum(['user', 'professional', 'review', 'booking', 'message']), targetId: z.string().uuid(), reason: z.string().min(3), details: z.string().optional() }), b);
    return this.db.one('INSERT INTO reports (reporter_id, target_kind, target_id, reason, details) VALUES ($1,$2,$3,$4,$5) RETURNING id', [u.id, i.targetKind, i.targetId, i.reason, i.details ?? null]);
  }
}

/* ===================== Reviews ===================== */
@Controller('reviews')
export class ReviewController {
  constructor(private db: Db) {}

  @Post('booking/:id')
  async create(@CurrentUser() u: AuthUser, @Param('id') bookingId: string, @Body() body: unknown) {
    const i = parse(z.object({
      workQuality: z.number().int().min(1).max(5).optional(), professionalism: z.number().int().min(1).max(5).optional(), punctuality: z.number().int().min(1).max(5).optional(),
      valueForMoney: z.number().int().min(1).max(5).optional(), communication: z.number().int().min(1).max(5).optional(), overall: z.number().int().min(1).max(5), body: z.string().max(2000).optional() }), body);
    const b = await this.db.one<any>('SELECT b.*, p.user_id AS pro_user FROM bookings b JOIN professional_profiles p ON p.id=b.professional_id WHERE b.id=$1', [bookingId]);
    if (!b) throw new BadRequestException('Unknown booking');
    const team = (await this.db.query<any>('SELECT user_id FROM business_members WHERE business_id=$1', [b.professional_id])).map((r) => r.user_id);
    const done = (await this.db.query<any>('SELECT booking_id FROM reviews WHERE booking_id=$1', [bookingId])).map((r) => r.booking_id);
    try {
      assertCanReview({ reviewerId: u.id, professionalOwnerIds: [b.pro_user, ...team], bookingCustomerId: b.customer_id, bookingStatus: b.status, alreadyReviewedBookingIds: done, bookingId,
        ratings: { work_quality: i.workQuality, professionalism: i.professionalism, punctuality: i.punctuality, value_for_money: i.valueForMoney, communication: i.communication, overall: i.overall } });
    } catch (e: any) { throw new BadRequestException(e.message); }
    const r = await this.db.one(
      `INSERT INTO reviews (booking_id, customer_id, professional_id, work_quality, professionalism, punctuality, value_for_money, communication, overall, body)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [bookingId, u.id, b.professional_id, i.workQuality ?? null, i.professionalism ?? null, i.punctuality ?? null, i.valueForMoney ?? null, i.communication ?? null, i.overall, i.body ?? null]);
    await this.db.query(`UPDATE professional_profiles SET rating_count = (SELECT count(*) FROM reviews WHERE professional_id=$1 AND status='published'), rating_avg = (SELECT COALESCE(avg(overall),0) FROM reviews WHERE professional_id=$1 AND status='published') WHERE id=$1`, [b.professional_id]);
    return r;
  }

  /** Professionals may respond publicly; there is deliberately no endpoint for them to delete a review. */
  @Post(':id/respond')
  async respond(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const text = parse(z.object({ body: z.string().min(2).max(1000) }), body).body;
    const r = await this.db.one<any>('SELECT r.professional_id, p.user_id FROM reviews r JOIN professional_profiles p ON p.id=r.professional_id WHERE r.id=$1', [id]);
    if (!r || r.user_id !== u.id) throw new ForbiddenException();
    await this.db.query('INSERT INTO review_responses (review_id, professional_id, body) VALUES ($1,$2,$3) ON CONFLICT (review_id) DO UPDATE SET body=EXCLUDED.body', [id, r.professional_id, text]);
    return { ok: true };
  }
  @Post(':id/flag') async flag(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const reason = parse(z.object({ reason: z.string().min(3) }), body).reason;
    await this.db.query(`INSERT INTO reports (reporter_id, target_kind, target_id, reason) VALUES ($1,'review',$2,$3)`, [u.id, id, reason]);
    return { ok: true };
  }
}

/* ===================== Notifications & saved items ===================== */
@Controller()
export class AccountController {
  constructor(private db: Db) {}
  @Get('notifications') list(@CurrentUser() u: AuthUser) { return this.db.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [u.id]); }
  @Post('notifications/:id/read') async read(@CurrentUser() u: AuthUser, @Param('id') id: string) { await this.db.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [id, u.id]); return { ok: true }; }
  @Post('push-token') async token(@CurrentUser() u: AuthUser, @Body() b: unknown) { const i = parse(z.object({ token: z.string(), platform: z.enum(['ios', 'android', 'web']) }), b); await this.db.query('INSERT INTO push_tokens (user_id, token, platform) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id', [u.id, i.token, i.platform]); return { ok: true }; }
  @Get('saved/professionals') saved(@CurrentUser() u: AuthUser) { return this.db.query('SELECT p.id, p.slug, p.display_name, p.rating_avg FROM saved_professionals s JOIN professional_profiles p ON p.id=s.professional_id WHERE s.user_id=$1', [u.id]); }
  @Post('saved/professionals/:id') async save(@CurrentUser() u: AuthUser, @Param('id') id: string) { await this.db.query('INSERT INTO saved_professionals (user_id, professional_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, id]); return { ok: true }; }
  @Get('locations') locations(@CurrentUser() u: AuthUser) { return this.db.query(`SELECT id,label,address,notes,ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM saved_locations WHERE user_id=$1`, [u.id]); }
  @Post('locations') async addLocation(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ label: z.string(), address: z.string(), lat: z.number(), lng: z.number(), notes: z.string().optional() }), b);
    return this.db.one('INSERT INTO saved_locations (user_id,label,address,location,notes) VALUES ($1,$2,$3,ST_SetSRID(ST_MakePoint($5,$4),4326)::geography,$6) RETURNING id', [u.id, i.label, i.address, i.lat, i.lng, i.notes ?? null]);
  }

    @Put('locations/:id') async editLocation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ label: z.string().min(1).optional(), address: z.string().min(3).optional(), lat: z.number().optional(), lng: z.number().optional(), notes: z.string().nullable().optional() }), b);
    const r = await this.db.one('UPDATE saved_locations SET label=COALESCE($3,label), address=COALESCE($4,address), location=CASE WHEN $5::float8 IS NULL OR $6::float8 IS NULL THEN location ELSE ST_SetSRID(ST_MakePoint($6::float8,$5::float8),4326)::geography END, notes=CASE WHEN $7::boolean THEN $8::text ELSE notes END WHERE id=$1 AND user_id=$2 RETURNING id', [id, u.id, i.label ?? null, i.address ?? null, i.lat ?? null, i.lng ?? null, i.notes !== undefined, i.notes ?? null]);
    if (!r) throw new ForbiddenException();
    return { ok: true };
  }
  @Delete('locations/:id') async removeLocation(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.db.query('DELETE FROM saved_locations WHERE id=$1 AND user_id=$2', [id, u.id]);
    return { ok: true };
  }

  /* ---- Address autocomplete (Kenya-biased, shared by customers, professionals and businesses) ---- */
  private placeCache = new Map<string, { at: number; v: any }>();
  private async geocode(path: string, params: Record<string, string>) {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) throw new BadRequestException('Address search is not configured. Set MAPBOX_TOKEN on the API service.');
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${path}.json?${new URLSearchParams({ ...params, access_token: token })}`;
    const hit = this.placeCache.get(url);
    if (hit && Date.now() - hit.at < 300_000) return hit.v;
    const r = await fetch(url);
    if (!r.ok) throw new BadRequestException('Address search is unavailable right now');
    const v: any = await r.json();
    if (this.placeCache.size > 500) this.placeCache.clear();
    this.placeCache.set(url, { at: Date.now(), v });
    return v;
  }
  @Get('places/search') async placeSearch(@Query('q') q = '', @Query('lat') lat?: string, @Query('lng') lng?: string) {
    const s = q.trim().slice(0, 120);
    if (s.length < 2) return [];
    const params: Record<string, string> = { country: 'ke', autocomplete: 'true', limit: '6', language: 'en', types: 'address,poi,neighborhood,locality,place' };
    if (lat && lng && Number.isFinite(+lat) && Number.isFinite(+lng)) params.proximity = `${+lng},${+lat}`; // rank nearby results first
    const j = await this.geocode(encodeURIComponent(s), params);
    return (j.features ?? []).map((f: any) => ({ id: f.id, title: f.text, label: f.place_name, lng: f.center[0], lat: f.center[1] }));
  }
  @Get('places/reverse') async placeReverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    if (!Number.isFinite(+lat) || !Number.isFinite(+lng)) throw new BadRequestException('lat and lng are required');
    const j = await this.geocode(`${+lng},${+lat}`, { limit: '1', language: 'en', types: 'address,poi,neighborhood,locality' });
    const f = j.features?.[0];
    return f ? { id: f.id, title: f.text, label: f.place_name, lat: +lat, lng: +lng } : null;
  }
  
  /** "Book again" loads the pro's CURRENT services and slots: never silently reuses an old price. */
  @Get('rebook/:bookingId') async rebook(@CurrentUser() u: AuthUser, @Param('bookingId') id: string) {
    const b = await this.db.one<any>('SELECT professional_id, address FROM bookings WHERE id=$1 AND customer_id=$2', [id, u.id]);
    if (!b) throw new ForbiddenException();
    return { professionalId: b.professional_id, address: b.address, services: await this.db.query(`SELECT ps.id, s.name FROM professional_services ps JOIN services s ON s.id=ps.service_id WHERE ps.professional_id=$1 AND ps.enabled`, [b.professional_id]) };
  }
  @Get('property-history') history(@CurrentUser() u: AuthUser, @Query('address') address: string) {
    return this.db.query(`SELECT b.completed_at, COALESCE(ps.title, s.name) service, p.display_name professional FROM bookings b JOIN professional_profiles p ON p.id=b.professional_id
      LEFT JOIN professional_services ps ON ps.id=b.professional_service_id LEFT JOIN services s ON s.id=ps.service_id WHERE b.customer_id=$1 AND b.address=$2 AND b.status IN ('completed','settlement_pending','settled') ORDER BY b.completed_at DESC`, [u.id, address]);
  }
}
