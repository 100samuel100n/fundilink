import { Injectable } from '@nestjs/common';
import { Db } from '../common/core.ts';

export type Channel = 'in_app' | 'push' | 'sms' | 'email';
export interface TemplateDef {
  key: string; group: string; audience: 'customer' | 'professional' | 'team' | 'any'; when: string;
  channels: Channel[]; vars: string[]; title: string; body: string; essential?: boolean;
}
const C: Channel[] = ['in_app', 'push'];

/** Every message the platform sends. Wording here is the default; the admin screen can override it. */
export const TEMPLATES: TemplateDef[] = [
  // ---- Customer: booking updates ----
  { key: 'booking_confirmed', group: 'Booking updates', audience: 'customer', when: 'The professional accepted the job.', channels: C, vars: ['reference'], title: 'Booking accepted · {{reference}}', body: 'Your professional accepted the job.' },
  { key: 'booking_declined', group: 'Booking updates', audience: 'customer', when: 'The professional declined the job.', channels: C, vars: ['reference', 'reasonLine'], title: 'Booking declined · {{reference}}', body: 'The professional could not take this job. Any payment is being refunded.{{reasonLine}}' },
  { key: 'booking_scheduled', group: 'Booking updates', audience: 'customer', when: 'The booking is placed on the calendar.', channels: C, vars: ['reference'], title: 'Booking scheduled · {{reference}}', body: 'Your booking is on the calendar.' },
  { key: 'booking_en_route', group: 'Booking updates', audience: 'customer', when: 'The professional starts travelling.', channels: C, vars: ['reference'], title: 'On the way · {{reference}}', body: 'Your professional has started the journey. Track them live.' },
  { key: 'arrival_pin', group: 'Booking updates', audience: 'customer', when: 'The professional arrives. The customer shares this PIN to start the job.', channels: C, vars: ['pin', 'reference'], essential: true, title: 'Your professional has arrived', body: 'Share PIN {{pin}} to start the job ({{reference}})' },
  { key: 'booking_in_progress', group: 'Booking updates', audience: 'customer', when: 'Work has started.', channels: C, vars: ['reference'], title: 'Job started · {{reference}}', body: 'Work has begun.' },
  { key: 'booking_awaiting_completion', group: 'Booking updates', audience: 'customer', when: 'The professional marks the work finished.', channels: C, vars: ['reference'], title: 'Work finished · {{reference}}', body: 'Please check the work and confirm so the job can close.' },
  { key: 'request_expired', group: 'Booking updates', audience: 'customer', when: 'The professional did not respond in time.', channels: C, vars: [], essential: true, title: 'Request expired', body: 'The professional did not respond in time. Your payment will be refunded; try another professional.' },

  // ---- Customer: payments, extra work ----
  { key: 'payment_received', group: 'Payments & refunds', audience: 'customer', when: 'An in-app payment is confirmed.', channels: C, vars: ['amount', 'reference'], essential: true, title: 'Payment received', body: '{{amount}} is held safely until the job is done. We have asked your professional to accept.' },
  { key: 'payment_returned', group: 'Payments & refunds', audience: 'customer', when: 'A payment arrived after the request had closed and is being sent back. (New key; was payment_refunded.)', channels: C, vars: ['amount'], essential: true, title: 'Payment being returned', body: '{{amount}} arrived after your request was closed, so we are sending it back to your M-Pesa.' },
  { key: 'payment_refunded', group: 'Payments & refunds', audience: 'customer', when: 'A refund has been sent to M-Pesa.', channels: C, vars: ['amount'], essential: true, title: 'Refund sent', body: '{{amount}} has been returned to your M-Pesa.' },
  { key: 'direct_payment_recorded', group: 'Payments & refunds', audience: 'customer', when: 'The professional recorded a pay-on-site payment.', channels: C, vars: ['amount', 'method'], essential: true, title: 'Payment recorded', body: 'Your professional recorded {{amount}} received by {{method}}. Please confirm once you are happy with the work.' },
  { key: 'revision_request', group: 'Extra work', audience: 'customer', when: 'The professional found extra work that needs approval.', channels: C, vars: ['professional', 'finding', 'amount'], essential: true, title: 'Extra work needs your approval', body: '{{professional}} found: {{finding}}. Extra cost {{amount}}. Nothing is charged until you approve.' },
  { key: 'addon_paid', group: 'Extra work', audience: 'customer', when: 'The customer paid for approved extra work.', channels: C, vars: ['amount', 'reference'], essential: true, title: 'Extra work paid', body: '{{amount}} received for the extra work on {{reference}}. Receipt issued.' },
  { key: 'addon_withdrawn', group: 'Extra work', audience: 'customer', when: 'The professional withdrew an extra-work request.', channels: C, vars: [], title: 'Extra work withdrawn', body: 'Your professional withdrew the extra-work request. Nothing is charged.' },
  { key: 'addon_expired', group: 'Extra work', audience: 'customer', when: 'An extra-work request timed out.', channels: C, vars: [], title: 'Extra-work request expired', body: 'The request was not answered in time. Nothing was charged.' },
  { key: 'support_reply', group: 'Support', audience: 'any', when: 'Support replied to a ticket.', channels: ['in_app', 'push', 'email'], vars: ['message'], title: 'Support replied', body: '{{message}}' },

  // ---- Professional: requests and jobs ----
  { key: 'booking_request', group: 'Jobs & requests', audience: 'professional', when: 'A customer paid in-app and wants to book you. Emergencies also send SMS.', channels: C, vars: ['label', 'description', 'net'], title: '{{label}}', body: '{{description}} · {{net}} after commission. Accept soon: requests expire.' },
  { key: 'booking_request_direct', group: 'Jobs & requests', audience: 'professional', when: 'A customer booked you to pay on site. (New key.)', channels: C, vars: ['label', 'description', 'net'], title: '{{label}}', body: '{{description}} · pay on site · {{net}} after commission' },
  { key: 'quote_request', group: 'Jobs & requests', audience: 'professional', when: 'A customer asked you for a quotation.', channels: ['in_app', 'push', 'sms'], vars: ['title'], title: 'New quotation request', body: '{{title}}' },
  { key: 'booking_completed', group: 'Jobs & requests', audience: 'professional', when: 'The customer confirmed the work.', channels: C, vars: ['reference'], title: 'Job confirmed complete · {{reference}}', body: 'The customer confirmed the work.' },
  { key: 'booking_cancelled', group: 'Jobs & requests', audience: 'any', when: 'Either side cancelled the booking.', channels: C, vars: ['reference', 'reasonLine'], title: 'Booking cancelled · {{reference}}', body: 'This booking was cancelled.{{reasonLine}}' },
  { key: 'booking_disputed', group: 'Jobs & requests', audience: 'any', when: 'An issue was raised on a booking.', channels: C, vars: ['reference', 'reasonLine'], title: 'Issue raised · {{reference}}', body: 'An issue was raised on this booking. Support will review it.{{reasonLine}}' },
  { key: 'addon_approved', group: 'Extra work', audience: 'professional', when: 'The customer approved extra work that must be paid in-app. (New key.)', channels: C, vars: ['reference', 'amount'], title: 'Extra work approved', body: 'Approved for {{reference}}. Waiting for the customer to pay {{amount}}; we will tell you the moment it lands.' },
  { key: 'addon_approved_direct', group: 'Extra work', audience: 'professional', when: 'The customer approved extra work on a pay-on-site job. (New key.)', channels: C, vars: ['reference', 'amount'], title: 'Extra work approved', body: 'Approved for {{reference}}: {{amount}} added to the on-site total. Collect it from the customer.' },
  { key: 'addon_declined', group: 'Extra work', audience: 'professional', when: 'The customer declined extra work.', channels: C, vars: ['reference'], title: 'Extra work declined', body: 'The customer declined the extra work on {{reference}}. Continue with the original scope.' },
  { key: 'addon_paid_pro', group: 'Extra work', audience: 'professional', when: 'The customer paid for extra work. (New key.)', channels: C, vars: ['amount'], title: 'Extra work approved and paid', body: 'The customer paid {{amount}} for the extra work. You can go ahead.' },
  { key: 'addon_expired_pro', group: 'Extra work', audience: 'professional', when: 'The customer did not answer an extra-work request in time. (New key.)', channels: C, vars: [], title: 'Extra-work request expired', body: 'The customer did not respond in time. Send it again if it is still needed.' },

  // ---- Professional: money ----
  { key: 'payout_sent', group: 'Payouts & wallet', audience: 'professional', when: 'A payout was sent to M-Pesa.', channels: C, vars: ['amount', 'receiptRef'], essential: true, title: 'Payout sent', body: '{{amount}} is on its way to your M-Pesa{{receiptRef}}.' },
  { key: 'payout_failed', group: 'Payouts & wallet', audience: 'professional', when: 'A payout could not be sent. It is retried automatically.', channels: C, vars: [], essential: true, title: 'Payout could not be sent', body: 'Check that your payout M-Pesa number is correct. We will retry automatically.' },
  { key: 'payout_changed', group: 'Payouts & wallet', audience: 'professional', when: 'The payout account was changed (security alert).', channels: ['in_app', 'sms', 'email'], vars: [], essential: true, title: 'Payout account changed', body: 'If this was not you, contact support immediately.' },
  { key: 'wallet_topup', group: 'Payouts & wallet', audience: 'professional', when: 'A wallet top-up succeeded.', channels: C, vars: ['amount', 'balance'], title: 'Wallet topped up', body: '{{amount}} added. Your balance is {{balance}}.' },
  { key: 'wallet_low', group: 'Payouts & wallet', audience: 'professional', when: 'Balance dropped to the low-balance alert level.', channels: C, vars: ['balance', 'reference'], title: 'Wallet running low', body: '{{balance}} left after {{reference}}. Top up with M-Pesa to keep receiving pay-on-site jobs.' },
  { key: 'wallet_empty', group: 'Payouts & wallet', audience: 'professional', when: 'Balance reached the minimum. Also sent by SMS.', channels: ['in_app', 'push', 'sms'], vars: ['commission', 'reference', 'balance'], essential: true, title: 'Wallet empty: top up to keep taking pay-on-site jobs', body: '{{commission}} commission for {{reference}} was taken from your wallet. Balance: {{balance}}. In-app paid jobs are unaffected.' },
  { key: 'wallet_netting', group: 'Payouts & wallet', audience: 'professional', when: 'Commission owed on pay-on-site jobs was cleared from an in-app payout. (New.)', channels: C, vars: ['amount'], title: 'Wallet balance recovered', body: '{{amount}} from this job cleared the commission you owed on pay-on-site jobs.' },
  { key: 'credential_expiring', group: 'Account & security', audience: 'professional', when: 'A verified credential expires within 30 days (daily check).', channels: ['in_app', 'push', 'email'], vars: [], title: 'A credential is expiring soon', body: 'Upload a renewed document to keep your verified badge.' },

  // ---- Business team ----
  { key: 'job_assigned', group: 'Team', audience: 'team', when: 'A job was assigned to a technician.', channels: ['in_app', 'push', 'sms'], vars: ['reference'], title: 'New job assigned', body: 'Booking {{reference}} is yours.' },
  { key: 'team_invite', group: 'Team', audience: 'team', when: 'A business invited a phone number with no account yet (SMS).', channels: ['sms'], vars: ['business'], title: 'Team invitation', body: '{{business}} invited you to join their team on FundiLink. Create an account with this number to accept.' },

  // ---- Sign-in ----
  { key: 'otp_code', group: 'Account & security', audience: 'any', when: 'Sign-in or sign-up code (SMS or email).', channels: ['sms', 'email'], vars: ['code', 'minutes'], essential: true, title: 'Your FundiLink code', body: 'Your FundiLink code is {{code}}. It expires in {{minutes}} minutes. Never share it.' },
];

export const SAMPLE_VARS: Record<string, string> = {
  reference: 'FL-2K9X4', amount: 'KSh 4,500', balance: 'KSh 1,200', commission: 'KSh 225', net: 'KSh 4,275', description: 'Fix a leaking kitchen sink',
  label: 'New booking request', professional: 'Grace Wanjiru', finding: 'a corroded pipe behind the sink', reasonLine: ' Reason: Customer asked to reschedule', pin: '4821',
  method: 'M-Pesa', receiptRef: ' (ref SGH7K2L9QX)', title: 'Rewire a 3-bedroom house', message: 'Hi, we have checked your account and fixed the issue.', business: 'Bright Electricals', code: '482913', minutes: '10',
};

const PLACEHOLDER = /\{\{\s*([A-Za-z_]\w*)\s*\}\}/g;
export const render = (tpl: string, vars: Record<string, unknown>) => tpl.replace(PLACEHOLDER, (_m, k: string) => (vars[k] == null ? '' : String(vars[k])));
export const unknownVars = (tpl: string, allowed: string[]) => [...tpl.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((k) => !allowed.includes(k));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const emailHtml = (title: string, body: string) =>
  `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#142A3B"><div style="font-weight:800;font-size:18px;color:#0B7F73;margin-bottom:16px">FundiLink</div><h2 style="margin:0 0 8px;font-size:18px">${esc(title)}</h2><p style="margin:0 0 16px;line-height:1.5">${esc(body)}</p><p style="font-size:12px;color:#6B7C8F">You are receiving this because of activity on your FundiLink account.</p></div>`;

@Injectable()
export class TemplateService {
  static instance: TemplateService | null = null;
  private cache = new Map<string, { at: number; v: { title?: string; body?: string; sms?: string } | null }>();
  constructor(private db: Db) { TemplateService.instance = this; }

  private async override(key: string) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.v;
    const r = await this.db.one<any>('SELECT value FROM platform_settings WHERE key=$1', [`template.${key}`]);
    const v = !r || r.value == null ? null : typeof r.value === 'string' ? { body: r.value } : r.value;
    this.cache.set(key, { at: Date.now(), v });
    return v;
  }
  clear(key?: string) { if (key) this.cache.delete(key); else this.cache.clear(); }

  /** Final wording for a template: the admin's edited version if there is one, otherwise the default above. */
  async build(key: string, vars: Record<string, unknown>) {
    const def = TEMPLATES.find((t) => t.key === key);
    if (!def) return null;
    const o = await this.override(key).catch(() => null);
    const title = render(o?.title || def.title, vars).trim() || render(def.title, vars);
    const body = render(o?.body || def.body, vars).trim() || render(def.body, vars);
    return { def, title, body, sms: o?.sms ? render(o.sms, vars).slice(0, 300) : undefined };
  }
}

/** For code that has no Notifier (cron jobs, SQL inserts inside transactions). Returns null if templates are not ready; callers keep a fallback. */
export const tplBuild = (key: string, vars: Record<string, unknown> = {}) => TemplateService.instance?.build(key, vars) ?? Promise.resolve(null);