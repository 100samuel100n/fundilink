'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useProviders } from '@/lib/demo';
import type { DemoAccount } from '@fundilink/sdk';
import { Button, Card, Chip, TextField } from './ui';
import { Icon } from './Icon';
import { Logo } from './Logo';

const ADMIN = ['super_admin', 'platform_admin', 'operations_manager', 'verification_officer', 'finance_officer', 'support_agent', 'dispute_officer', 'content_manager', 'marketing_manager', 'analyst'];

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [role, setRole] = useState<'customer' | 'professional'>(sp.get('role') === 'professional' ? 'professional' : 'customer');
  const [f, setF] = useState({ fullName: '', phone: '', email: '', password: '', otp: '' });
  const [useOtp, setUseOtp] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(sp.get('error') ? `Google sign-in: ${sp.get('error')}` : '');
  const { google, demo } = useProviders();
  const [accts, setAccts] = useState<DemoAccount[]>([]);
  const [devCode, setDevCode] = useState('');
  React.useEffect(() => { if (demo) api.demoAccounts().then(setAccts).catch(() => {}); }, [demo]);
  const googleGo = () => {
    const back = `${location.origin}/auth/callback${sp.get('next') ? `?next=${encodeURIComponent(sp.get('next')!)}` : ''}`;
    location.href = api.googleStartUrl(back, role);
  };
  const fill = (a: DemoAccount) => { setUseOtp(false); setF({ ...f, phone: a.identifier, password: a.password }); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const sendOtp = async () => {
    setBusy(true); setErr('');
    try { const r = await api.requestOtp(f.phone, mode === 'register' ? 'signup' : 'login'); setSent(true); if (r?.devCode) { setDevCode(r.devCode); setF((x) => ({ ...x, otp: r.devCode! })); } } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const s = mode === 'register'
        ? await api.register({ fullName: f.fullName, phone: f.phone, email: f.email || undefined, password: f.password || undefined, otp: f.otp, role })
        : await api.login({ identifier: f.phone || f.email, password: useOtp ? undefined : f.password, otp: useOtp ? f.otp : undefined });
      const next = sp.get('next');
      router.replace(next && next.startsWith('/') ? next : s.roles.some((r) => ADMIN.includes(r)) ? '/admin' : s.roles.includes('professional') && !s.roles.includes('customer') ? '/professional' : role === 'professional' && mode === 'register' ? '/professional/onboarding' : '/app');
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <main id="main" className="auth">
      <aside className="auth-art" aria-hidden="true">
        <Logo className="logo" />
        <h2>{mode === 'login' ? 'Good to see you again.' : 'Get the job done, with confidence.'}</h2>
        <p>Kenya's marketplace for trusted professionals. Clear prices, protected payments, real people.</p>
        <ul className="pts">
          <li><span className="ico"><Icon name="badgeCheck" size={20} /></span><div><b>Verified professionals</b><span>Identity and qualifications checked, never bought.</span></div></li>
          <li><span className="ico"><Icon name="lock" size={20} /></span><div><b>Pay safely with M-Pesa</b><span>Held until you confirm the work. Or pay on site.</span></div></li>
          <li><span className="ico"><Icon name="navigation" size={20} /></span><div><b>Live arrival tracking</b><span>Know exactly when your professional arrives.</span></div></li>
        </ul>
      </aside>
      <div className="auth-form"><div style={{ width: '100%', maxWidth: 456 }}>
      <Card>
        <h1 style={{ fontSize: '1.7rem' }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        {mode === 'register' ? <div className="chips" role="group" aria-label="I am a" style={{ marginBottom: 12 }}><Chip label="I need a service" on={role === 'customer'} onClick={() => setRole('customer')} /><Chip label="I am a professional" on={role === 'professional'} onClick={() => setRole('professional')} /></div> : null}
        {google ? (<>
          <button type="button" className="gbtn" onClick={googleGo}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Continue with Google
          </button>
          <div className="divider">or use your phone</div>
        </>) : null}
        <form onSubmit={submit} noValidate>
          {mode === 'register' ? (
            <>
              <TextField label="Full name" autoComplete="name" value={f.fullName} onChange={set('fullName')} required />
              <TextField label="Email (optional)" type="email" autoComplete="email" value={f.email} onChange={set('email')} />
            </>
          ) : null}
          <TextField label={mode === 'login' ? 'Phone or email' : 'Phone number'} autoComplete="tel" inputMode="tel" placeholder="+2547…" value={f.phone} onChange={set('phone')} required />
          {mode === 'login' && !useOtp ? <TextField label="Password" type="password" autoComplete="current-password" value={f.password} onChange={set('password')} /> : null}
          {mode === 'register' ? <TextField label="Password (optional)" type="password" autoComplete="new-password" hint="Leave empty to sign in with a text code each time." value={f.password} onChange={set('password')} /> : null}
          {mode === 'register' || useOtp ? (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}><TextField label="SMS code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={f.otp} onChange={set('otp')} /></div>
              <Button tone="secondary" onClick={sendOtp} loading={busy} disabled={f.phone.length < 9} style={{ marginBottom: 12 }}>{sent ? 'Resend' : 'Send code'}</Button>
            </div>
          ) : null}
          {devCode ? <p className="small" style={{ color: 'var(--good-fg)' }}>Demo mode: your code is <strong>{devCode}</strong> (filled in for you).</p> : null}
          {err ? <p role="alert" style={{ color: 'var(--bad-fg)' }}>{err}</p> : null}
          <Button type="submit" block loading={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
        </form>
        {mode === 'login' ? <p className="small" style={{ marginTop: 12 }}><button className="btn sm ghost" onClick={() => setUseOtp(!useOtp)}>{useOtp ? 'Use password instead' : 'Sign in with SMS code'}</button></p> : null}
        <p className="small muted">{mode === 'login' ? <>New here? <Link href="/register">Create an account</Link></> : <>Already registered? <Link href="/login">Sign in</Link></>}</p>
      </Card>
      {mode === 'login' && accts.length ? (
        <div className="demo">
          <strong>Demo accounts</strong> <span className="small muted">tap to fill, then Sign in</span>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>{accts.map((a) => <button key={a.identifier} type="button" className="btn sm ghost" onClick={() => fill(a)} title={a.note}>{a.label}</button>)}</div>
          <p className="small muted" style={{ marginBottom: 0 }}>Password for all: <code>{accts[0].password}</code></p>
        </div>
      ) : null}
      </div></div>
    </main>
  );
}
