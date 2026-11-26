'use client';
import React from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './Icon';
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
export function StateCard({ icon = 'shield', tone = 'info', title, body, actions, children }: {
  icon?: IconName; tone?: 'info' | 'warn' | 'bad' | 'good'; title: string; body?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className={cx('state', tone)} role={tone === 'bad' ? 'alert' : 'status'}>
      <span className="state-ico" aria-hidden="true"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {body ? <p className="muted">{body}</p> : null}
      {children}
      {actions ? <div className="state-actions">{actions}</div> : null}
    </div>
  );
}

type Fix = { icon: IconName; tone: 'info' | 'warn' | 'bad'; title: string; body: string; href?: string; cta?: string };
/** Turns an API failure into a specific reason and a next step. Never names internal roles or permissions. */
function explain(status: number | undefined, message: string): Fix {
  const m = (message ?? '').toLowerCase();
  if (status === 403) {
    if (m.includes('no professional profile')) return { icon: 'user', tone: 'info', title: 'Finish setting up your professional profile', body: 'This section needs a professional profile. It takes a few minutes: tell us what you do, where you work and which services you offer.', href: '/professional/onboarding', cta: 'Continue setup' };
    if (m.includes('business account')) return { icon: 'building', tone: 'info', title: 'Team tools are for business accounts', body: 'You are registered as an individual professional, so team management is switched off. Business accounts can add technicians, assign jobs and track each person’s performance.', href: '/contact', cta: 'Ask about a business account' };
    if (m.includes('wallet')) return { icon: 'wallet', tone: 'info', title: 'Your wallet opens once you are verified', body: 'Wallets are created for verified professionals so earnings can be paid out safely. Complete your verification to unlock it.', href: '/professional/verification', cta: 'Go to verification' };
    return { icon: 'lock', tone: 'info', title: 'This section is restricted', body: 'It is limited to people with specific responsibilities. If your work needs it, ask your team lead to arrange access, or contact support and we will help.', href: '/contact', cta: 'Contact support' };
  }
  if (status === 404) return { icon: 'search', tone: 'info', title: 'We could not find that', body: 'It may have been moved or removed.', href: '/', cta: 'Go home' };
  if (status === 429) return { icon: 'clock', tone: 'warn', title: 'Too many attempts', body: 'Please wait a minute and try again.' };
  return { icon: 'alertCircle', tone: 'bad', title: 'Something went wrong', body: message || 'Please try again in a moment.' };
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as any;
  const f = explain(e?.status, e?.message);
  return (
    <StateCard icon={f.icon} tone={f.tone} title={f.title} body={f.body}
      actions={<>{f.href ? <LinkButton href={f.href}>{f.cta ?? 'Continue'}</LinkButton> : null}{onRetry && e?.status !== 403 ? <Button tone="secondary" onClick={onRetry}>Try again</Button> : null}</>} />
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

