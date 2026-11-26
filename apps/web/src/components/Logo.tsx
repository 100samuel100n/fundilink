import React from 'react';
import Link from 'next/link';

/** FundiLink mark: a rounded tile with a chain link, then the wordmark. Pure SVG: crisp at any size, themed by CSS. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id="fl-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#25C9B5" /><stop offset="1" stopColor="#0A6F66" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill="url(#fl-g)" />
      <g transform="translate(4 4) scale(1)" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 14a4.2 4.2 0 0 0 6.3.45l2.5-2.5a4.2 4.2 0 0 0-5.9-5.9l-1.4 1.4" />
        <path d="M13 12a4.2 4.2 0 0 0-6.3-.45l-2.5 2.5a4.2 4.2 0 0 0 5.9 5.9l1.4-1.4" />
      </g>
    </svg>
  );
}
export function Logo({ href = '/', className = 'logo' }: { href?: string; className?: string }) {
  return <Link href={href} className={className} aria-label="FundiLink home"><LogoMark /><span className="wm">Fundi<b>Link</b></span></Link>;
}
