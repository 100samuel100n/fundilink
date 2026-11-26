'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@fundilink/sdk';
import { api, onSessionLost, store } from './api';

interface Auth {
  ready: boolean; session: Session | null; roles: string[];
  isCustomer: boolean; isPro: boolean; isAdmin: boolean; isOrg: boolean;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Auth>(null as any);
export const useAuth = () => useContext(Ctx);

const ADMIN = ['super_admin', 'platform_admin', 'operations_manager', 'verification_officer', 'finance_officer', 'support_agent', 'dispute_officer', 'content_manager', 'marketing_manager', 'analyst'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const load = useCallback(async () => { setSession(await store.get()); setReady(true); }, []);
  useEffect(() => {
    onSessionLost(() => setSession(null));
    load();
    window.addEventListener('fl:session', load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener('fl:session', load); window.removeEventListener('storage', load); };
  }, [load]);
  const signOut = useCallback(async () => { await api.logout(); setSession(null); }, []);
  const value = useMemo<Auth>(() => {
    const roles = session?.roles ?? [];
    return {
      ready, session, roles, signOut,
      isCustomer: roles.includes('customer'),
      isPro: roles.some((r) => r === 'professional' || r === 'business_member'),
      isAdmin: roles.some((r) => ADMIN.includes(r)),
      isOrg: roles.includes('customer') || roles.includes('org_member'),
    };
  }, [ready, session, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
