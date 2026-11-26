'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { homeFor, safeNext } from '@/lib/routes';


function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState('Finishing sign-in…');
  useEffect(() => {
    const code = sp.get('code'); const err = sp.get('error');
    if (err || !code) { router.replace(`/login?error=${encodeURIComponent(err ?? 'cancelled')}`); return; }
    api.googleExchange(code).then((s) => {
      router.replace(safeNext(sp.get('next')) ?? homeFor(s.roles));
    }).catch((e) => setMsg(e.message ?? 'Sign-in failed'));
  }, [sp, router]);
  return <main id="main" className="wrap section center"><p>{msg}</p></main>;
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
