'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import type { PlaceSuggestion } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, getPosition } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button } from '@/components/ui';

export interface PickedPlace { address: string; lat: number; lng: number }

/** Type-ahead address field (like Bolt): suggestions as you type, or one tap for current location. */
export function AddressSearch({ label = 'Address', value, onChange, onPick, near, placeholder = 'Estate, street, building or landmark', showGps = true }: {
  label?: string; value: string; onChange: (text: string) => void; onPick: (p: PickedPlace) => void;
  near?: { lat: number; lng: number } | null; placeholder?: string; showGps?: boolean;
}) {
  const t = useToast();
  const id = useId();
  const inp = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const skip = useRef(false);
  const seq = useRef(0);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }               // value changed because of a pick, not typing
    if (document.activeElement !== inp.current) return;               // only search while the user is typing here
    const q = value.trim();
    if (q.length < 3) { setItems([]); setOpen(false); return; }
    const n = ++seq.current;
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.suggestPlaces(q, near ?? undefined);
        if (n === seq.current) { setItems(r); setOpen(r.length > 0); setHi(-1); }
      } catch { if (n === seq.current) { setItems([]); setOpen(false); } }
      finally { if (n === seq.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  const pick = (s: PlaceSuggestion) => {
    seq.current++; skip.current = s.label !== value;
    onChange(s.label); onPick({ address: s.label, lat: s.lat, lng: s.lng });
    setItems([]); setOpen(false);
  };
  const gps = async () => {
    try {
      const g = await getPosition();
      const r = await api.reversePlace(g.lat, g.lng).catch(() => null);
      seq.current++;
      const address = r?.label ?? `GPS ${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}`;
      onChange(address); onPick({ address, lat: g.lat, lng: g.lng });
      setItems([]); setOpen(false);
    } catch (e) { t.err(errMsg(e)); }
  };
  const key = (e: React.KeyboardEvent) => {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => (i + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => (i <= 0 ? items.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(items[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="field" ref={box} style={{ position: 'relative' }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} ref={inp} value={value} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open} aria-autocomplete="list"
        onChange={(e) => onChange(e.target.value)} onFocus={() => items.length && setOpen(true)} onKeyDown={key} />
      {open && items.length ? (
        <ul role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, margin: '4px 0 0', padding: 4, listStyle: 'none', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.14)', maxHeight: 280, overflowY: 'auto' }}>
          {items.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(s); }} onMouseEnter={() => setHi(i)}
              style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: i === hi ? 'var(--surface-2)' : 'transparent' }}>
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div className="small muted">{s.label}</div>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="hint">{loading ? 'Searching…' : 'Start typing and pick a suggestion, or use your current location.'}</span>
      {showGps ? <div><Button small tone="secondary" onClick={gps}>Use my current location</Button></div> : null}
    </div>
  );
}