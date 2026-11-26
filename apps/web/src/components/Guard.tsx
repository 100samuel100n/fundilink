'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/routes';
import { Button, LinkButton, Skeleton, StateCard } from './ui';
import { Icon, type IconName } from './Icon';

type Need = 'customer' | 'pro' | 'admin' | 'any';

function Splash({ label }: { label?: string }) {
  return <div className="wrap section" role="status" aria-live="polite">{label ? <p className="muted center" style={{ marginBottom: 12 }}>{label}</p> : null}<Skeleton h={120} n={3} /></div>;
}

/** Sends people to the portal that is theirs instead of showing a dead end. The API still enforces every permission. */
export function Guard({ need, children }: { need: Need; children: React.ReactNode }) {
  const { ready, session, roles, isCustomer, isPro, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const ok = need === 'any' || (need === 'customer' && (isCustomer || isAdmin)) || (need === 'pro' && isPro) || (need === 'admin' && isAdmin);
  const dest = homeFor(roles);
  const stuck = !ok && (path === dest || path.startsWith(`${dest}/`));
  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (!ok && !stuck) router.replace(dest);
  }, [ready, session, ok, stuck, dest, path, router]);
  if (!ready || !session) return <Splash />;
  if (!ok) {
    return stuck ? (
      <div className="wrap narrow section">
        <StateCard icon="user" title="We are still setting up your account" body="Your account does not have a workspace yet. Sign out and sign back in, or contact support and we will sort it out quickly."
          actions={<><LinkButton href="/contact">Contact support</LinkButton><Button tone="secondary" onClick={() => signOut().then(() => router.push('/'))}>Sign out</Button></>} />
      </div>
    ) : <Splash label="Taking you to your dashboard…" />;
  }
  return <>{children}</>;
}

type NavLink = { href: string; label: string; icon?: IconName; group?: string };

export function Shell({ links, children, variant }: { links: NavLink[]; children: React.ReactNode; variant?: 'admin' }) {
  const path = usePathname();
  const [more, setMore] = React.useState(false);
  const cur = (l: NavLink) => path === l.href || (l.href.split('/').length > 2 && path.startsWith(l.href));
  const primary = links.filter((l) => l.icon).slice(0, 4);
  return (
    <div className={variant ? `shell ${variant}` : 'shell'}>
      <nav className="side" aria-label="Section">
        {links.map((l, i) => (
          <React.Fragment key={l.href}>
            {l.group && l.group !== links[i - 1]?.group ? <div className="grp">{l.group}</div> : null}
            <Link href={l.href} aria-current={cur(l) ? 'page' : undefined}>{l.label}</Link>
          </React.Fragment>
        ))}
      </nav>
      <main id="main" style={{ minWidth: 0 }}>{children}</main>
      {primary.length ? (
        <>
          <nav className="bottomnav" aria-label="Quick navigation">
            {primary.map((l) => <Link key={l.href} href={l.href} aria-current={cur(l) ? 'page' : undefined}><Icon name={l.icon!} size={22} />{l.label}</Link>)}
            <a href="#more" onClick={(e) => { e.preventDefault(); setMore(true); }} aria-haspopup="dialog"><Icon name="menu" size={22} />More</a>
          </nav>
          {more ? (
            <div role="dialog" aria-modal="true" aria-label="All sections" onClick={() => setMore(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,42,59,.45)', display: 'flex', alignItems: 'flex-end' }}>
              <div className="pop" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', borderRadius: '20px 20px 0 0', padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px))', maxHeight: '80vh', overflowY: 'auto' }}>
                <div className="row between" style={{ marginBottom: 8 }}><strong>All sections</strong><button className="btn sm ghost" onClick={() => setMore(false)} aria-label="Close"><Icon name="x" size={18} /></button></div>
                <div className="stack" style={{ gap: 2 }}>{links.map((l) => <Link key={l.href} href={l.href} onClick={() => setMore(false)} style={{ padding: '12px 8px', fontWeight: 600 }}>{l.label}</Link>)}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
