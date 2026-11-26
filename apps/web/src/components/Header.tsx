'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { Icon } from './Icon';
import { Logo } from './Logo';

export function Header() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { ready, session, isPro, isAdmin, signOut } = useAuth();
  const cur = (h: string) => (path === h || (h !== '/' && path.startsWith(h)) ? 'page' : undefined);
  return (
    <header className="hdr">
      <div className="wrap">
        <Logo />
        <nav className={open ? 'nav open' : 'nav'} aria-label="Main" onClick={() => setOpen(false)}>
          <Link href="/explore" aria-current={cur('/explore')}>Find a professional</Link>
          <Link href="/services" aria-current={cur('/services')}>Services</Link>
          <Link href="/for-businesses" aria-current={cur('/for-businesses')}>For businesses</Link>
          <Link href="/for-professionals" aria-current={cur('/for-professionals')}>Become a professional</Link>
          <Link href="/emergency" aria-current={cur('/emergency')}>Urgent help</Link>
          <Link href="/help" aria-current={cur('/help')}>Help</Link>
        </nav>
        <span className="spacer" />
        {!ready ? null : session ? (
          <>
            <Link className="btn sm secondary" href={isAdmin ? '/admin' : isPro ? '/professional' : '/app'}>My account</Link>
            <button className="btn sm ghost" onClick={() => signOut()}>Sign out</button>
          </>
        ) : (
          <>
            <Link className="btn sm ghost" href="/login">Sign in</Link>
            <Link className="btn sm" href="/register">Sign up</Link>
          </>
        )}
        <button className="btn sm ghost burger" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} size={20} /></button>
      </div>
    </header>
  );
}

export function Footer() {
  const social = Object.entries(SITE.social).filter(([, v]) => v) as [string, string][];
  const names: Record<string, string> = { x: 'X', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn' };
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <Logo className="logo" />
            <p className="small tag">Discover, compare and book trusted professionals across Kenya, with clear prices and secure payments.</p>
            <p style={{ margin: '14px 0 0' }}><span className="momo-tag"><i>M</i>Pay with M-Pesa</span></p>
            <div className="contact">
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
              {SITE.supportPhone ? <a href={`tel:${SITE.supportPhone.replace(/\s+/g, '')}`}>{SITE.supportPhone}</a> : null}
              <span>{SITE.hours}</span>
            </div>
            {social.length ? <div className="social">{social.map(([k, v]) => <a key={k} href={v} rel="noopener noreferrer" target="_blank">{names[k]}</a>)}</div> : null}
          </div>
          <div><h4>Company</h4><ul><li><Link href="/about">About</Link></li><li><Link href="/how-it-works">How it works</Link></li><li><Link href="/contact">Contact</Link></li></ul></div>
          <div><h4>Explore</h4><ul><li><Link href="/services">Services</Link></li><li><Link href="/locations">Locations</Link></li><li><Link href="/emergency">Urgent help</Link></li><li><Link href="/for-professionals">Become a professional</Link></li><li><Link href="/for-businesses">For businesses</Link></li></ul></div>
          <div><h4>Support</h4><ul><li><Link href="/help">Help centre</Link></li><li><Link href="/safety">Safety</Link></li><li><Link href="/terms">Terms</Link></li><li><Link href="/privacy">Privacy</Link></li></ul></div>
        </div>
        <p className="legal">© {new Date().getFullYear()} FundiLink by {SITE.company}{SITE.address ? `, ${SITE.address}` : ''}. Professionals are independent providers; FundiLink coordinates booking, payment and reviews.</p>
      </div>
    </footer>
  );
}
