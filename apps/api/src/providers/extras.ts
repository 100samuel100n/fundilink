import { Injectable, Logger } from '@nestjs/common';

/* ============ WhatsApp (Meta Cloud API). Opt-in only; approved templates required for first contact. ============ */
@Injectable()
export class WhatsApp {
  private log = new Logger('WhatsApp');
  async send(toE164: string, template: string, params: string[]) {
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) { this.log.warn(`[dev] WhatsApp ${template} -> ${toE164}: ${params.join(' | ')}`); return; }
    const r = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: toE164.replace(/^\+/, ''), type: 'template',
        template: { name: template, language: { code: 'en' }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] } }),
    });
    if (!r.ok) throw new Error(`WhatsApp failed: ${r.status}`);
  }
}

/* ============ Masked calling: provider bridges both legs so private numbers are never shown ============ */
@Injectable()
export class MaskedCalls {
  private log = new Logger('MaskedCalls');
  /** Uses Telnyx Call Control: dial the caller first, then bridge to the callee, presenting the platform number to both. */
  async bridge(a: { callerPhone: string; calleePhone: string; sessionId: string }): Promise<{ providerRef: string }> {
    if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_VOICE_CONNECTION_ID) { this.log.warn(`[dev] masked call ${a.sessionId}`); return { providerRef: `dev_${a.sessionId}` }; }
    const r = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: process.env.TELNYX_VOICE_CONNECTION_ID, to: a.callerPhone, from: process.env.TELNYX_FROM,
        client_state: Buffer.from(JSON.stringify({ bridgeTo: a.calleePhone, session: a.sessionId })).toString('base64') }),
    });
    if (!r.ok) throw new Error(`Call bridge failed: ${r.status}`);
    return { providerRef: String(((await r.json()) as any)?.data?.call_control_id ?? a.sessionId) };
  }
}

/* ============ Search index: Postgres by default, OpenSearch when SEARCH_BACKEND=opensearch ============ */
export interface SearchIndex { upsert(doc: { id: string; [k: string]: unknown }): Promise<void>; remove(id: string): Promise<void>; query(q: string, geo?: { lat: number; lng: number; km: number }): Promise<string[]> }

@Injectable()
export class OpenSearchIndex implements SearchIndex {
  private base = process.env.OPENSEARCH_URL;
  private h = { 'Content-Type': 'application/json', ...(process.env.OPENSEARCH_AUTH ? { Authorization: `Basic ${process.env.OPENSEARCH_AUTH}` } : {}) };
  get enabled() { return process.env.SEARCH_BACKEND === 'opensearch' && !!this.base; }
  async upsert(doc: { id: string }) { if (!this.enabled) return; await fetch(`${this.base}/professionals/_doc/${doc.id}`, { method: 'PUT', headers: this.h, body: JSON.stringify(doc) }); }
  async remove(id: string) { if (!this.enabled) return; await fetch(`${this.base}/professionals/_doc/${id}`, { method: 'DELETE', headers: this.h }); }
  async query(q: string, geo?: { lat: number; lng: number; km: number }) {
    if (!this.enabled) return [];
    const must: any[] = [{ multi_match: { query: q, fields: ['display_name^3', 'headline', 'services^2', 'categories', 'bio'], fuzziness: 'AUTO' } }];
    const filter = geo ? [{ geo_distance: { distance: `${geo.km}km`, location: { lat: geo.lat, lon: geo.lng } } }] : [];
    const r = await fetch(`${this.base}/professionals/_search`, { method: 'POST', headers: this.h, body: JSON.stringify({ size: 100, _source: false, query: { bool: { must, filter } } }) });
    return r.ok ? (((await r.json()) as any).hits.hits as { _id: string }[]).map((h) => h._id) : [];
  }
}
