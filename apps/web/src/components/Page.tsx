import React from 'react';
export function Page({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return <main id="main" className="wrap narrow section prose"><h1 style={{ fontSize: '2.2rem' }}>{title}</h1>{lead ? <p className="muted" style={{ fontSize: '1.15rem' }}>{lead}</p> : null}{children}</main>;
}
