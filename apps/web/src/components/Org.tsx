'use client';
import React, { createContext, useContext } from 'react';
import type { Organization } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync, useLocalState } from '@/lib/hooks';
import { Async, Select, Skeleton } from './ui';

const Ctx = createContext<{ org: Organization | null }>({ org: null });
export const useOrg = () => useContext(Ctx).org;

export function OrgProvider({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const orgs = useAsync(() => api.orgs());
  const [sel, setSel] = useLocalState('fl.org', '');
  return (
    <Async state={orgs} skeleton={<Skeleton h={80} />}>{(list) => {
      if (!list.length) return <>{fallback}</>;
      const org = list.find((o) => o.id === sel) ?? list[0];
      return (
        <Ctx.Provider value={{ org }}>
          {list.length > 1 ? <Select label="Organisation" value={org.id} onChange={(e) => setSel(e.target.value)} options={list.map((o) => ({ value: o.id, label: `${o.name} (${o.role})` }))} /> : <p className="muted small">{org.name} · {org.role}</p>}
          {children}
        </Ctx.Provider>
      );
    }}</Async>
  );
}
