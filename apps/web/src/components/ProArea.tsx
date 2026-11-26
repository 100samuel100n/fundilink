'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/routes';
import { Shell } from './Guard';
import { Icon, type IconName } from './Icon';
import { Badge, ErrorState, LinkButton, Skeleton, StateCard } from './ui';

export type ProProfile = { status: 'onboarding' | 'in_review' | 'active' | 'suspended' | 'deactivated'; account_type: 'individual' | 'business'; display_name?: string };
const Ctx = createContext<ProProfile | null>(null);
export const useProProfile = () => useContext(Ctx);

type NavLink = { href: string; label: string; icon?: IconName; group?: string };
const FULL: NavLink[] = [
  { href: '/professional', label: 'Home', icon: 'home' }, { href: '/professional/requests', label: 'Requests', icon: 'bell' }, { href: '/professional/bookings', label: 'Jobs', icon: 'calendar' },
  { href: '/professional/quotations', label: 'Quotations' }, { href: '/professional/services', label: 'Services & prices' }, { href: '/professional/availability', label: 'Availability' },
  { href: '/professional/portfolio', label: 'Portfolio' }, { href: '/professional/customers', label: 'Customers' }, { href: '/professional/messages', label: 'Messages', icon: 'message' },
  { href: '/professional/earnings', label: 'Earnings & payouts' }, { href: '/professional/wallet', label: 'Wallet' }, { href: '/professional/analytics', label: 'Analytics' }, { href: '/professional/reviews', label: 'Reviews' },
  { href: '/professional/warranty', label: 'Warranty claims' }, { href: '/professional/verification', label: 'Verification' }, { href: '/professional/team', label: 'Team' },
  { href: '/professional/equipment', label: 'Equipment for hire' }, { href: '/professional/marketing', label: 'Grow & invoices' }, { href: '/professional/plan', label: 'Plan & activation' }, { href: '/professional/settings', label: 'Settings' },
];
const SETUP: NavLink[] = [
  { href: '/professional', label: 'Setup & status', icon: 'home' }, { href: '/professional/verification', label: 'Verification', icon: 'badgeCheck' },
  { href: '/professional/services', label: 'Services & prices', icon: 'list' }, { href: '/professional/availability', label: 'Availability', icon: 'calendar' },
  { href: '/professional/portfolio', label: 'Portfolio' }, { href: '/professional/plan', label: 'Plan & activation' }, { href: '/professional/settings', label: 'Settings' },
];
const MEMBER: NavLink[] = [{ href: '/professional/bookings', label: 'Jobs', icon: 'calendar' }, { href: '/professional/messages', label: 'Messages', icon: 'message' }, { href: '/professional/team', label: 'Team' }];
const inSetup = (p: string) => p === '/professional' || SETUP.some((l) => l.href !== '/professional' && p.startsWith(l.href));
const inMember = (p: string) => MEMBER.some((l) => p.startsWith(l.href));

type St = { kind: 'loading' } | { kind: 'none'; path: string } | { kind: 'ok'; p: ProProfile; path: string } | { kind: 'error'; e: any; path: string };

function Splash() { return <div className="wrap section"><Skeleton h={120} n={3} /></div>; }

function SetupHub({ p }: { p: ProProfile }) {
  const [v, setV] = useState<any>(null);
  useEffect(() => { api.verification().then(setV).catch(() => setV({ levels: [], licenceGaps: [] })); }, []);
  const support = <LinkButton tone="secondary" href="/contact">Contact support</LinkButton>;
  if (p.status === 'suspended') return <StateCard tone="bad" icon="alertCircle" title="Your account is suspended" body="New bookings and your public listing are paused. Contact support to find out why and what is needed to restore access." actions={<><LinkButton href="/contact">Contact support</LinkButton><LinkButton tone="secondary" href="/help">Help centre</LinkButton></>} />;
  if (p.status === 'deactivated') return <StateCard tone="warn" icon="lock" title="Your account is deactivated" body="Your profile is hidden and you are not receiving requests. Contact support to reactivate it." actions={<LinkButton href="/contact">Contact support</LinkButton>} />;

  const id = v?.levels?.find((r: any) => r.level === 'identity');
  const gaps: any[] = v?.licenceGaps ?? [];
  const rejected = id?.state === 'rejected';
  const title = rejected ? 'We could not verify your identity' : p.status === 'in_review' ? 'Your profile is under review' : 'Finish setting up to get verified';
  const body = rejected
    ? (id.decision_reason || 'The document you sent could not be accepted. Please send a clear, complete copy.')
    : p.status === 'in_review'
      ? 'We are checking your details and will notify you as soon as there is a decision. You can keep improving your profile meanwhile.'
      : 'Customers cannot see or book you yet. Your requests, jobs and earnings unlock as soon as we have verified you.';
  const steps: { label: string; href?: string; done?: boolean; state?: string }[] = [
    { label: 'Create your profile', done: true },
    { label: 'Add your services and prices', href: '/professional/services' },
    { label: 'Set your weekly availability', href: '/professional/availability' },
    { label: 'Verify your identity', href: '/professional/verification', state: id?.state, done: id?.state === 'approved' },
    ...gaps.map((g) => ({ label: `Upload your ${g.name} licence`, href: '/professional/verification' })),
    { label: 'Add photos of your work (optional)', href: '/professional/portfolio' },
  ];
  const cta = rejected ? 'Resubmit document' : id?.state === 'pending' ? 'View verification status' : 'Submit identity document';
  return (
    <StateCard tone={rejected ? 'warn' : 'info'} icon={rejected ? 'alertCircle' : 'badgeCheck'} title={title} body={body} actions={<><LinkButton href="/professional/verification">{cta}</LinkButton>{support}</>}>
      <ul className="state-steps">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? 'done' : undefined}>
            <span className="dot" aria-hidden="true">{s.done ? <Icon name="check" size={14} /> : null}</span>
            {s.href && !s.done ? <Link href={s.href}>{s.label}</Link> : <span>{s.label}</span>}
            {s.state && !s.done ? <Badge tone={s.state === 'pending' ? 'warning' : s.state === 'rejected' ? 'danger' : 'neutral'}>{s.state}</Badge> : null}
          </li>
        ))}
      </ul>
    </StateCard>
  );
}

export function ProArea({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { roles } = useAuth();
  const [n, setN] = useState(0);
  const [st, setSt] = useState<St>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    api.myProfile()
      .then((p: ProProfile) => { if (live) setSt({ kind: 'ok', p, path }); })
      .catch((e: any) => { if (live) setSt(e?.status === 403 ? { kind: 'none', path } : { kind: 'error', e, path }); });
    return () => { live = false; };
  }, [path, n]);

  const onboarding = path.startsWith('/professional/onboarding');
  const member = roles.includes('business_member') && !roles.includes('professional');
  const none = st.kind === 'none' && st.path === path;     // confirmed "no profile" for this very page
  const profile = st.kind === 'ok' ? st.p : null;           // a known profile stays trusted while re-checking after navigation

  let go: string | null = null;
  if (profile) {
    if (onboarding) go = '/professional';
    else if (profile.status !== 'active' && !inSetup(path)) go = '/professional';
  } else if (none) {
    if (member) { if (!inMember(path)) go = '/professional/bookings'; }
    else if (!onboarding) go = roles.includes('professional') ? '/professional/onboarding' : homeFor(roles);
  }
  useEffect(() => { if (go && go !== path) router.replace(go); }, [go, path, router]);

  if (st.kind === 'error' && st.path === path) return <div className="wrap section"><ErrorState error={st.e} onRetry={() => { setSt({ kind: 'loading' }); setN((x) => x + 1); }} /></div>;
  if (go) return <Splash />;
  if (none && onboarding) return <div className="wrap section">{children}</div>;
  if (profile) {
    const active = profile.status === 'active';
    const links = active ? FULL.filter((l) => l.href !== '/professional/team' || profile.account_type === 'business') : SETUP;
    return <Ctx.Provider value={profile}><Shell links={links}>{!active && path === '/professional' ? <SetupHub p={profile} /> : children}</Shell></Ctx.Provider>;
  }
  if (none && member) return <Shell links={MEMBER}>{children}</Shell>;
  return <Splash />;
}