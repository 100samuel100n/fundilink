import type { Category, ProProfile, SearchResult, SearchParams } from '@fundilink/sdk';
import { API_URL } from './api';

/** Server-side fetch for public pages. Never throws: pages render an empty state if the API is down. */
async function pub<T>(path: string, revalidate = 120): Promise<T | null> {
  try {
    const r = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
export const getCategories = () => pub<Category[]>('/discover/categories', 600);
export const getProfile = (slug: string) => pub<ProProfile>(`/discover/professionals/${encodeURIComponent(slug)}`, 60);
export function getSearch(p: SearchParams) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') q.set(k, String(v));
  return pub<SearchResult>(`/discover/search?${q}`, 60);
}
