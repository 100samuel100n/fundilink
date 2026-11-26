'use client';
import React from 'react';
import Link from 'next/link';
import { kes, type ProCard as P } from '@fundilink/sdk';
import { Avatar, Badge, Card, Stars } from './ui';
import { Icon } from './Icon';
import { useCompare } from './Compare';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';

/** Built for a decision: who they are, how trusted, can they come, what it costs, then one clear action. */
export function ProCardView({ pro, sponsored, urgent }: { pro: P; sponsored?: boolean; urgent?: boolean }) {
  const { items, toggle } = useCompare();
  const { session } = useAuth();
  const t = useToast();
  const picked = items.some((i) => i.id === pro.id);
  const v = pro.verification;
  const save = async () => {
    if (!session) return t.err('Sign in to save professionals');
    try { await api.savePro(pro.id); t.ok('Saved'); } catch (e: any) { t.err(e.message); }
  };
  const name = pro.businessName ?? pro.name;
  return (
    <Card className="pro">
      <Avatar name={name} src={pro.logoUrl} />
      <div style={{ minWidth: 0 }}>
        <div className="row wrap-r" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}><Link href={`/professionals/${pro.slug}`}>{name}</Link></h3>
          {pro.newcomer ? <Badge tone="info">New</Badge> : null}
          {sponsored ? <Badge>Sponsored</Badge> : null}
        </div>
        <p className="muted small" style={{ margin: '2px 0 6px' }}>{pro.headline ?? (pro.accountType === 'business' ? 'Registered business' : 'Independent professional')} · {pro.area ?? pro.county}</p>
        <div className="trust">
          {v.identity ? <span className="vbadge"><Icon name="check" size={13} stroke={2.5} />ID verified</span> : null}
          {v.qualification ? <span className="vbadge"><Icon name="check" size={13} stroke={2.5} />Qualified</span> : null}
          {v.business ? <span className="vbadge"><Icon name="check" size={13} stroke={2.5} />Business</span> : null}
        </div>
        <div className="facts">
          <Stars value={pro.reviews > 0 ? pro.rating : 0} count={pro.reviews > 0 ? pro.reviews : undefined} />
          {pro.completedJobs > 0 ? <span><Icon name="badgeCheck" size={15} />{pro.completedJobs} jobs</span> : null}
          {pro.distanceKm != null ? <span><Icon name="pin" size={15} />{pro.distanceKm.toFixed(1)} km</span> : null}
          {pro.responseMinutes != null ? <span><Icon name="clock" size={15} />Replies in ~{pro.responseMinutes} min</span> : null}
          <span className={pro.availableNow ? 'ok' : undefined}><Icon name="calendar" size={15} />{pro.availableNow ? 'Available now' : 'Check availability'}</span>
          {pro.acceptsEmergency ? <span><Icon name="alertCircle" size={15} />Takes urgent jobs</span> : null}
        </div>
        {pro.portfolioPreview?.length ? <div className="thumbs">{pro.portfolioPreview.slice(0, 3).map((u) => <img key={u} src={u} alt="" loading="lazy" />)}</div> : null}
        <div className="row wrap-r" style={{ marginTop: 8 }}>
          <span className="price">{pro.startingPrice != null ? <><small>From </small>{kes(pro.startingPrice)}</> : 'Quotation only'}</span>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={save} aria-label="Save professional"><Icon name="heart" size={16} /></button>
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={picked} onChange={() => toggle({ id: pro.id, name })} /> Compare</label>
          <Link className="btn sm secondary" href={`/professionals/${pro.slug}`}>Profile</Link>
          <Link className="btn sm" href={`/app/book/${pro.slug}${urgent ? '?emergency=1' : ''}`}>{urgent ? 'Book urgently' : 'Book'}</Link>
        </div>
      </div>
    </Card>
  );
}
