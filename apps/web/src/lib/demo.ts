'use client';
import { useEffect, useState } from 'react';
import type { LatLng } from '@fundilink/sdk';
import { api } from './api';

let cached: Promise<{ google: boolean; demo: boolean }> | null = null;
export const providers = () => (cached ??= api.authProviders().catch(() => ({ google: false, phoneOtp: true, demo: false })));
export function useProviders() {
  const [p, set] = useState<{ google: boolean; demo: boolean }>({ google: false, demo: false });
  useEffect(() => { providers().then(set); }, []);
  return p;
}
const key = (id: string) => `fl.simpos.${id}`;
export const saveSimPos = (id: string, p: LatLng) => { try { sessionStorage.setItem(key(id), JSON.stringify(p)); } catch { /* ignore */ } };
export const loadSimPos = (id: string): LatLng | null => { try { const s = sessionStorage.getItem(key(id)); return s ? JSON.parse(s) : null; } catch { return null; } };
/** In demo mode GPS-gated steps use the simulated position, so you can test from your desk. */
export async function demoPosition(id: string, step: 'start' | 'current'): Promise<LatLng | null> {
  if (!(await providers()).demo) return null;
  const plan = await api.demoJourneyPlan(id);
  if (step === 'start') { saveSimPos(id, plan.start); return plan.start; }
  return loadSimPos(id) ?? plan.destination;
}
