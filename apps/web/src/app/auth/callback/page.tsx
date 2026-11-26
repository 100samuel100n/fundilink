'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

const ADMIN = ['super_admin', 'platform_admin', 'operations_manager', 'verification_officer', 'finance_officer', 'support_agent', 'dispute_officer', 'content_manager', 'marketing_manager', 'analyst'];

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState('Finishing sign-in…');
  useEffect(() => {
    const code = sp.get('code'); const err = sp.get('error');
    if (err || !code) { router.replace(`/login?error=${encodeURIComponent(err ?? 'cancelled')}`); return; }
    api.googleExchange(code).then((s) => {
      const next = sp.get('next');
      router.replace(next && next.startsWith('/') ? next : s.roles.some((r) => ADMIN.includes(r)) ? '/admin' : s.roles.includes('professional') && !s.roles.includes('customer') ? '/professional' : '/app');
    }).catch((e) => setMsg(e.message ?? 'Sign-in failed'));
  }, [sp, router]);
  return <main id="main" className="wrap section center"><p>{msg}</p></main>;
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
