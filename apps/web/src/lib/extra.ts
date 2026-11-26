import { API_URL, api, store } from './api';
/** Endpoints the SDK does not wrap yet. */
export const extra = {
  reviewsMine: () => api.get<any[]>('/reviews/mine').catch(() => [] as any[]),
};
export const errMsg = (e: unknown) => (e as any)?.message ?? 'Something went wrong';
export const isForbidden = (e: unknown) => (e as any)?.status === 403;

/** Roles live in the JWT; after a role change (e.g. onboarding) rotate the tokens to pick them up. */
export async function refreshSession() {
  const cur = await store.get();
  if (!cur) return;
  try {
    const r = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: cur.refreshToken }) });
    if (r.ok) await store.set(await r.json());
  } catch { /* keep the old session */ }
}
