'use client';
import React, { createContext, useCallback, useContext } from 'react';
import Link from 'next/link';
import { useLocalState } from '@/lib/hooks';
import { Button } from './ui';
import { Icon } from './Icon';

type Item = { id: string; name: string };
const Ctx = createContext<{ items: Item[]; toggle: (i: Item) => void; clear: () => void }>({ items: [], toggle() {}, clear() {} });
export const useCompare = () => useContext(Ctx);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useLocalState<Item[]>('fl.compare', []);
  const toggle = useCallback((i: Item) => {
    setItems(items.some((x) => x.id === i.id) ? items.filter((x) => x.id !== i.id) : items.length >= 4 ? items : [...items, i]);
  }, [items, setItems]);
  return (
    <Ctx.Provider value={{ items, toggle, clear: () => setItems([]) }}>
      {children}
      {items.length > 0 ? (
        <div className="tray" role="region" aria-label="Compare professionals">
          <div className="wrap row wrap-r">
            <strong>Compare ({items.length}/4)</strong>
            {items.map((i) => <button key={i.id} className="chip on" onClick={() => toggle(i)} aria-label={`Remove ${i.name}`}>{i.name} <Icon name="x" size={12} /></button>)}
            <span className="spacer" />
            <Button tone="ghost" small onClick={() => setItems([])}>Clear</Button>
            {items.length >= 2 ? <Link className="btn sm" href={`/compare?ids=${items.map((i) => i.id).join(',')}`}>Compare</Link> : <span className="muted small">Pick at least 2</span>}
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
