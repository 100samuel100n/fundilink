'use client';
import React from 'react';
import Link from 'next/link';
import { kes, STATUS_LABEL, STATUS_TONE, type Tone } from '@fundilink/sdk';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function Button({ tone, small, block, loading, className, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'secondary' | 'ghost' | 'danger'; small?: boolean; block?: boolean; loading?: boolean }) {
  return <button type="button" {...p} disabled={p.disabled || loading} aria-busy={loading || undefined} className={cx('btn', tone, small && 'sm', block && 'block', className)}>{children}</button>;
}
export function LinkButton({ href, tone, small, children }: { href: string; tone?: 'secondary' | 'ghost' | 'danger'; small?: boolean; children: React.ReactNode }) {
  return <Link href={href} className={cx('btn', tone, small && 'sm')}>{children}</Link>;
}
export function Card({ children, className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div {...p} className={cx('card', className)}>{children}</div>; }

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: React.ReactNode; id?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{hint && !error ? <span className="hint">{hint}</span> : null}{error ? <span className="error" role="alert">{error}</span> : null}</div>;
}
export function TextField({ label, hint, error, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = React.useId();
  return <Field label={label} hint={hint} error={error} id={id}><input id={id} aria-invalid={!!error} {...p} /></Field>;
}
export function TextArea({ label, hint, error, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const id = React.useId();
  return <Field label={label} hint={hint} error={error} id={id}><textarea id={id} aria-invalid={!!error} {...p} /></Field>;
}
export function Select({ label, hint, options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; options: { value: string | number; label: string }[] }) {
  const id = React.useId();
  return <Field label={label} hint={hint} id={id}><select id={id} {...p}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
}
export function Check({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="check"><input type="checkbox" {...p} />{label}</label>; }
export function Chip({ label, on, onClick }: { label: string; on?: boolean; onClick?: () => void }) { return <button type="button" className={cx('chip', on && 'on')} aria-pressed={!!on} onClick={onClick}>{label}</button>; }

type BadgeTone = Tone | 'success' | 'warning' | 'danger';
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: BadgeTone }) {
  const cssTone = tone === 'success' ? 'good' : tone === 'warning' ? 'warn' : tone === 'danger' ? 'bad' : tone;
  return <span className={cx('badge', cssTone !== 'neutral' && cssTone)}>{children}</span>;
}
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{STATUS_LABEL[status] ?? status}</Badge>;

export function Stars({ value, count }: { value: number; count?: number }) {
  const full = Math.round(value);
  return <span aria-label={`Rated ${value.toFixed(1)} out of 5`}><span className="stars">{'★'.repeat(full)}<span className="off">{'★'.repeat(5 - full)}</span></span> <span className="muted small">{value > 0 ? value.toFixed(1) : 'New'}{count != null ? ` (${count})` : ''}</span></span>;
}
export function Avatar({ name, src, size }: { name: string; src?: string | null; size?: number }) {
  const ini = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return <div className="avatar" style={size ? { width: size, height: size } : undefined}>{src ? <img src={src} alt="" loading="lazy" /> : ini}</div>;
}
export const Money = ({ minor, bold }: { minor: number | string | null | undefined; bold?: boolean }) => <span style={bold ? { fontWeight: 800 } : undefined}>{kes(minor)}</span>;

export function Skeleton({ h = 80, n = 1 }: { h?: number; n?: number }) {
  return <div className="stack" aria-hidden>{Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>;
}
export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{body ? <p className="muted">{body}</p> : null}{action}</div>;
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as any;
  const forbidden = e?.status === 403;
  return (
    <div className="errbox" role="alert">
      <h3>{forbidden ? 'You do not have access to this' : 'Something went wrong'}</h3>
      <p className="muted">{forbidden ? 'Your role does not include this permission. Ask a Super Admin if you need it.' : e?.message ?? 'Please try again.'}</p>
      {onRetry && !forbidden ? <Button tone="secondary" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
/** Renders loading / error / empty / data in one place. */
export function Async<T>({ state, skeleton, empty, children }: { state: { data?: T; error?: Error; loading: boolean; reload: () => void }; skeleton?: React.ReactNode; empty?: (d: T) => boolean; children: (d: T) => React.ReactNode }) {
  if (state.loading) return <>{skeleton ?? <Skeleton h={90} n={3} />}</>;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return null;
  return <>{children(state.data)}</>;
}
export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return <div className="pagetitle"><div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>{action}</div>;
}
export function Stat({ n, l }: { n: React.ReactNode; l: string }) { return <div className="stat"><div className="n">{n}</div><div className="l">{l}</div></div>; }

