'use client';
import { API_URL } from './api';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [s, set] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const ref = useRef(fn); ref.current = fn;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = useCallback(async (silent = false) => {
    if (!silent) set((p) => ({ ...p, loading: true, error: undefined }));
    try { const data = await ref.current(); if (alive.current) set({ data, loading: false }); }
    catch (e: any) { if (alive.current) set((p) => ({ data: silent ? p.data : undefined, error: e, loading: false })); }
  }, []);
  useEffect(() => { run(); }, [run, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: () => run(false), refresh: () => run(true) };
}

export function usePoll(fn: () => void, ms: number, active = true) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { if (!active) return; const id = setInterval(() => ref.current(), ms); return () => clearInterval(id); }, [ms, active]);
}

/** Browser GPS as a promise. */
export function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Location is not supported on this device'));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => rej(new Error('Location permission denied. Enter a place instead.')), { enableHighAccuracy: true, timeout: 10000 });
  });
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, set] = useState<T>(initial);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) set(JSON.parse(s)); } catch { /* ignore */ } }, [key]);
  const update = useCallback((n: T) => { set(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ } }, [key]);
  return [v, update] as const;
}

/** Convert an unknown thrown value into a user-facing error message. */
export const errMsg = (e: unknown): string => {
  const m = e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? 'Something went wrong';
  // Browsers report every network/CORS failure as "Failed to fetch": say what it usually means here.
  if (e instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(m)) {
    return `Can't reach the server at ${API_URL}. The API service may be down, NEXT_PUBLIC_API_URL may be wrong, or the API's PUBLIC_WEB_URL doesn't include this site.`;
  }
  return m;
};
