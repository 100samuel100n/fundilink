import { FundiLink, type Session, type TokenStore } from '@fundilink/sdk';

const KEY = 'fl.session';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

let lost: (() => void) | undefined;
export const onSessionLost = (fn: () => void) => { lost = fn; };

/** SSR-safe: on the server there is no session, so the store is empty and public endpoints still work. */
export const store: TokenStore = {
  async get() {
    if (typeof window === 'undefined') return null;
    try { const s = window.localStorage.getItem(KEY); return s ? (JSON.parse(s) as Session) : null; } catch { return null; }
  },
  async set(s) {
    if (typeof window === 'undefined') return;
    try { if (s) window.localStorage.setItem(KEY, JSON.stringify(s)); else window.localStorage.removeItem(KEY); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event('fl:session'));
  },
};

export const api = new FundiLink({ baseUrl: API_URL, store, onSessionLost: () => lost?.() });
