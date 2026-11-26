import { Body, Controller, Injectable, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Db, Public, parse } from '../common/core.ts';
import { Ai } from '../providers/providers.ts';

const SAFETY = `You help people hire skilled professionals in Kenya. Never diagnose dangerous faults (gas, electrical, structural) and never encourage DIY repair of them: tell the person to switch off at the mains / keep clear and book a qualified professional. Never invent prices, guarantees, or arrival times.`;

function safeJson<T>(s: string, fallback: T): T {
  const m = s.match(/\{[\s\S]*\}/);
  try { return m ? (JSON.parse(m[0]) as T) : fallback; } catch { return fallback; }
}

@Injectable()
export class AiService {
  constructor(private ai: Ai, private db: Db) {}

  /** "water leaking under my kitchen sink, need someone tomorrow morning in Kilimani" -> structured search. */
  async understand(text: string) {
    const cats = await this.db.query<{ slug: string; name: string }>('SELECT slug, name FROM categories WHERE active');
    const out = await this.ai.complete(
      `${SAFETY}\nExtract a search from the customer's message. Reply with ONLY JSON: {"category": one of [${cats.map((c) => c.slug).join(', ')}] or null, "problem": short string, "locationText": string|null, "dateText": string|null, "timeOfDay": "morning"|"afternoon"|"evening"|null, "urgent": boolean, "dangerous": boolean}. "dangerous" is true for gas leaks, exposed live wires, sparking, flooding near electricity, structural cracks.`,
      text, { json: true, maxTokens: 300 });
    return safeJson(out, { category: null, problem: text, locationText: null, dateText: null, timeOfDay: null, urgent: false, dangerous: false });
  }

  /** Guided intake: ask 2-4 follow-ups, then produce a structured brief for the professional. */
  async brief(history: { role: 'user' | 'assistant'; content: string }[], category?: string) {
    const transcript = history.map((h) => `${h.role}: ${h.content}`).join('\n');
    const out = await this.ai.complete(
      `${SAFETY}\nYou are collecting details for a ${category ?? 'service'} job. If you still need information, reply JSON {"done":false,"question":"<one short question>"}. Ask at most 4 questions in total across the conversation. When you have enough, reply JSON {"done":true,"title":"","summary":"","details":["..."],"suggestedPhotos":["..."],"safetyNote":string|null}. This is a preliminary description only, not a diagnosis.`,
      transcript, { json: true, maxTokens: 500 });
    return safeJson(out, { done: false, question: 'Can you describe the problem in a bit more detail?' });
  }

  /** Customer support assistant. Sensitive intents escalate to a human. */
  async support(u: AuthUser | null, message: string, context?: { bookingId?: string }) {
    const escalate = /(refund|chargeback|scam|fraud|stolen|unsafe|assault|harass|injur|hacked|money (is )?missing|double charged|police)/i.test(message);
    let booking = '';
    if (u && context?.bookingId) {
      const b = await this.db.one<any>('SELECT reference, status, scheduled_during FROM bookings WHERE id=$1 AND (customer_id=$2 OR professional_id IN (SELECT id FROM professional_profiles WHERE user_id=$2))', [context.bookingId, u.id]);
      if (b) booking = `\nThe user's booking ${b.reference} is currently "${b.status}".`;
    }
    if (escalate) return { reply: 'I\'m sorry you\'re dealing with this. I\'m passing it to our support team now so a person can look into it properly. You\'ll hear from us in the app.', escalated: true };
    const reply = await this.ai.complete(
      `${SAFETY}\nYou are FundiLink's support assistant. Answer briefly and warmly about booking, cancelling, rescheduling, payments, how verification works, becoming a professional, and tracking a professional. Booking flow: search -> choose -> describe -> pick time -> see price -> pay -> pro accepts -> pro travels (live map) -> start PIN -> work -> customer confirms -> review. Money is held by the payment partner until the customer confirms completion. If unsure, say so and offer human support.${booking}`,
      message, { maxTokens: 400 });
    return { reply, escalated: false };
  }

  /** Professional's quotation helper. Output is a DRAFT: the professional must review all figures. */
  async quoteDraft(requirements: string, trade: string) {
    const out = await this.ai.complete(
      `${SAFETY}\nYou help a ${trade} write a professional quotation. Reply ONLY JSON: {"scope":"","exclusions":"","durationDays":number,"items":[{"label":"","kind":"labour|materials|transport|other","quantity":number,"unitAmount":null}],"milestones":[{"title":"","percentBps":number,"criteria":""}],"questions":["things the professional must confirm"]}. NEVER fill in prices: unitAmount must be null so the professional enters real figures. Milestone percentBps must total 10000.`,
      requirements, { json: true, maxTokens: 700 });
    return { draft: safeJson(out, null), notice: 'AI draft. Review and enter your own prices before sending.' };
  }
}

@Controller('ai')
export class AiController {
  constructor(private s: AiService) {}
  @Post('understand') understand(@Body() b: unknown) { return this.s.understand(parse(z.object({ text: z.string().min(3).max(1000) }), b).text); }
  @Post('brief') brief(@Body() b: unknown) { const i = parse(z.object({ history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).min(1).max(12), category: z.string().optional() }), b); return this.s.brief(i.history, i.category); }
  @Public() @Post('support') support(@CurrentUser() u: AuthUser | undefined, @Body() b: unknown) { const i = parse(z.object({ message: z.string().min(2).max(1000), bookingId: z.string().uuid().optional() }), b); return this.s.support(u ?? null, i.message, { bookingId: i.bookingId }); }
  @Post('quote-draft') quote(@Body() b: unknown) { const i = parse(z.object({ requirements: z.string().min(10).max(3000), trade: z.string() }), b); return this.s.quoteDraft(i.requirements, i.trade); }
}
