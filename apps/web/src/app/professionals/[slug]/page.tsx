import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { kes, PRICING_LABEL } from '@fundilink/sdk';
import { getProfile } from '@/lib/server';
import { abs, breadcrumb, pageMeta } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { Avatar, Badge, Card, Stars } from '@/components/ui';
import { ProfileActions } from '@/components/ProfileActions';
import { MapLazy } from '@/components/MapLazy';
import { Icon } from '@/components/Icon';
import Link from 'next/link';

/** Portfolio media arrives as an array of urls/objects or a single object; normalise to image urls. */
function mediaUrls(media: any): string[] {
  const arr = Array.isArray(media) ? media : media ? [media] : [];
  return arr.map((m: any) => (typeof m === 'string' ? m : m?.url ?? m?.src ?? '')).filter((u: string) => /^https?:\/\//.test(u));
}

type P = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProfile(slug);
  if (!p) return { title: 'Professional not found', robots: { index: false, follow: false } };
  const n = p.businessName ?? p.name;
  const where = p.serviceAreas.map((a) => a.town ?? a.county).filter(Boolean).slice(0, 2).join(', ');
  const bio = p.bio?.replace(/\s+/g, ' ').trim().slice(0, 155);
  return pageMeta({
    title: `${n}${p.headline ? `: ${p.headline}` : ''}${where ? ` in ${where}` : ''}`,
    description: bio || `${n} on FundiLink${where ? `, serving ${where}` : ''}. ${p.stats.reviews} reviews, ${p.stats.completedJobs} completed jobs. Book and pay securely.`,
    path: `/professionals/${slug}`,
  });
}

export default async function ProfilePage({ params }: P) {
  const { slug } = await params;
  const p = await getProfile(slug);
  if (!p) notFound();
  const n = p.businessName ?? p.name;
  const areas = p.serviceAreas.map((a) => a.town ?? a.county).filter(Boolean) as string[];
const ld = {
  '@context': 'https://schema.org', '@type': 'ProfessionalService', '@id': abs(`/professionals/${slug}#business`), name: n, url: abs(`/professionals/${slug}`),
  description: p.bio ?? p.headline ?? undefined, image: p.logoUrl ?? undefined,
  address: { '@type': 'PostalAddress', addressCountry: 'KE', ...(areas[0] ? { addressLocality: areas[0] } : {}) },
  areaServed: areas.map((a) => ({ '@type': 'Place', name: a })),
  ...(p.reviews.length > 0 && p.stats.reviews > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.stats.rating, reviewCount: p.stats.reviews } } : {}),
};
  const bd = p.ratingBreakdown ?? {};
  // The headline rating must agree with the reviews a visitor can actually read.
  const reviewCount = p.reviews.length > 0 ? p.stats.reviews : 0;
  const work = p.portfolio.map((w) => ({ ...w, imgs: mediaUrls(w.media) }));
  const photos = work.flatMap((w) => w.imgs.map((u) => ({ u, t: w.title }))).slice(0, 7);
  const has = (k: string) => p.verification.includes(k);
  return (
    <main id="main" className="wrap section">
     <JsonLd data={[ld, breadcrumb([{ name: 'Home', path: '/' }, { name: 'Find a professional', path: '/explore' }, { name: n, path: `/professionals/${slug}` }])]} />
      <div className="split ps">
        <div className="stack" style={{ gap: 20 }}>
          {/* A. identity */}
          <Card>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar name={n} src={p.logoUrl} size={84} />
              <div>
                <h1 style={{ fontSize: '1.8rem', marginBottom: 4 }}>{n}</h1>
                {p.businessName ? <p className="muted" style={{ margin: 0 }}>{p.name}</p> : null}
                <p className="muted" style={{ margin: '4px 0' }}>{p.headline} · {[p.area, p.county].filter(Boolean).join(', ')}</p>
                <div className="row wrap-r" style={{ gap: 6 }}>
                  {p.verification.includes('identity') ? <Badge tone="good">Identity verified</Badge> : null}
                  {p.verification.includes('qualification') ? <Badge tone="good">Qualification verified</Badge> : null}
                  {p.verification.includes('business') ? <Badge tone="good">Business verified</Badge> : null}
                  {!p.verification.length ? <Badge>Not yet verified</Badge> : null}
                  <span className="muted small">Member since {new Date(p.memberSince).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
            {p.bio ? <p style={{ marginTop: 16 }}>{p.bio}</p> : null}
            <p className="muted small" style={{ margin: 0 }}>Languages: {p.languages.join(', ')}{p.yearsExperience != null ? ` · ${p.yearsExperience} years experience` : ''}</p>
          </Card>

          {photos.length ? (
            <section aria-labelledby="gal"><h2 id="gal">Recent work</h2>
              <div className="gallery">{photos.map((x, i) => <figure key={x.u + i}><img src={x.u} alt={x.t} loading={i === 0 ? 'eager' : 'lazy'} /><figcaption>{x.t}</figcaption></figure>)}</div>
            </section>
          ) : null}

          {/* B. reputation */}
          <section aria-labelledby="rep"><h2 id="rep">Reputation</h2>
            <div className="grid g4">
              {[[<Stars key="s" value={reviewCount ? p.stats.rating : 0} count={reviewCount || undefined} />, 'Overall rating'], [p.stats.completedJobs, 'Completed bookings'], [`${Math.round(p.stats.completionRate * 100)}%`, 'Completion rate'], [`${Math.round(p.stats.cancellationRate * 100)}%`, 'Cancellation rate'], [p.stats.responseMinutes != null ? `${p.stats.responseMinutes} min` : '—', 'Avg response time']].map(([v, l], i) => (
                <div className="stat" key={i}><div className="n" style={{ fontSize: '1.3rem' }}>{v}</div><div className="l">{l}</div></div>
              ))}
            </div>
          </section>

          <section aria-labelledby="tr"><h2 id="tr">How we know</h2>
            <div className="grid g2">
              <Card className="flat"><h3>Verification</h3>
                <ul className="vlist">
                  {([['identity', 'Identity checked against official ID', 'Identity not yet verified'], ['business', 'Business registration checked', 'Business registration not verified'], ['qualification', 'Qualification or licence checked', 'Qualification not verified']] as const).map(([k, yesL, noL]) => (
                    <li key={k} className={has(k) ? undefined : 'off'}><Icon name={has(k) ? 'badgeCheck' : 'x'} size={18} /><span>{has(k) ? yesL : noL}</span></li>
                  ))}
                </ul>
                <p className="muted small" style={{ margin: '10px 0 0' }}>Each badge is separate and earned by review. No fee can buy a badge, a rating or search ranking.</p>
              </Card>
              <Card className="flat"><h3>Reputation signals</h3>
                <div className="signals">
                  {[['Completion rate', p.stats.completionRate], ['Jobs not cancelled', 1 - p.stats.cancellationRate]].map(([l, v]) => (
                    <div className="signal" key={String(l)}><span>{l}</span><strong>{Math.round(Number(v) * 100)}%</strong><div className="bar"><i style={{ width: `${Math.round(Number(v) * 100)}%` }} /></div></div>
                  ))}
                  <div className="signal"><span>Verified reviews</span><strong>{reviewCount}</strong></div>
                  <div className="signal"><span>Completed bookings</span><strong>{p.stats.completedJobs}</strong></div>
                  <div className="signal"><span>Average response</span><strong>{p.stats.responseMinutes != null ? `${p.stats.responseMinutes} min` : '—'}</strong></div>
                </div>
                <p className="muted small" style={{ margin: '10px 0 0' }}>These are the signals customers see. Professionals can see the same numbers and challenge a review or a dispute outcome through support.</p>
              </Card>
            </div>
          </section>

          {/* C. qualifications */}
          {p.qualifications.length ? <section aria-labelledby="q"><h2 id="q">Qualifications</h2><ul>{p.qualifications.map((q, i) => <li key={i}><strong>{q.title}</strong> <span className="muted">· {q.kind}{q.issuer ? ` · ${q.issuer}` : ''}</span></li>)}</ul><p className="muted small">Listed credentials are only marked “verified” above once our team has checked them.</p></section> : null}

          {/* D. services */}
          <section aria-labelledby="sv"><h2 id="sv">Services and prices</h2>
            {p.services.length ? <div className="tablewrap"><table><thead><tr><th>Service</th><th>Pricing</th><th>Duration</th></tr></thead><tbody>
              {p.services.map((s) => (
                <tr key={s.id}><td><strong>{s.name}</strong>{s.description ? <div className="muted small">{s.description}</div> : null}{s.warranty_days ? <Badge tone="info">{s.warranty_days}-day warranty</Badge> : null}</td>
                  <td>{s.pricing.map((x, i) => <div key={i}>{PRICING_LABEL[x.model]}{x.amount != null ? `: ${kes(x.amount)}${x.unit ? ` / ${x.unit}` : ''}` : ''}{x.emergency ? <span className="muted small"> (urgent {kes(x.emergency)})</span> : null}</div>)}</td>
                  <td>{s.duration_minutes} min</td></tr>
              ))}</tbody></table></div> : <Card className="flat"><p style={{ marginTop: 0 }}><strong>Prices depend on the job.</strong> This professional has not listed fixed services yet. Describe your job and they can send an itemised quotation.</p><Link className="btn sm" href="/app/quotations/new">Request a quotation</Link></Card>}
          </section>

          {/* E. portfolio */}
          {work.length ? <section aria-labelledby="pf"><h2 id="pf">Projects</h2><div className="grid g3">{work.map((w) => <Card key={w.id}>{w.imgs[0] ? <img src={w.imgs[0]} alt="" loading="lazy" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 'var(--r-control)', marginBottom: 10 }} /> : null}<h3>{w.title}</h3>{w.description ? <p className="muted small" style={{ margin: 0 }}>{w.description}</p> : null}</Card>)}</div></section> : <Card className="flat"><h2 style={{ fontSize: '1.1rem' }}>Portfolio</h2><p className="muted" style={{ margin: 0 }}>No project photos yet. Ask for examples of similar work when you message or request a quotation.</p></Card>}

          {/* F/G. availability + coverage */}
          <section aria-labelledby="cov"><h2 id="cov">Availability and coverage</h2>
            <p>{p.acceptsEmergency ? 'Accepts urgent jobs. ' : ''}Travels up to <strong>{p.travel.maxTravelKm} km</strong>; free within {p.travel.freeRadiusKm} km{p.travel.perKm ? `, then ${kes(p.travel.perKm)}/km` : ''}{p.travel.minCallOut ? `. Minimum call-out ${kes(p.travel.minCallOut)}` : ''}.</p>
            {p.serviceAreas.length ? <div className="chips">{p.serviceAreas.map((a, i) => <span className="chip" key={i}>{[a.estate, a.town, a.county].filter(Boolean).join(', ')}</span>)}</div> : null}
            <div style={{ marginTop: 12 }}><MapLazy center={p.mapPin} markers={[{ id: p.id, ...p.mapPin, label: `${n}: approximate service area` }]} /></div>
            <p className="muted small">Approximate location only. Live position is shared only during an accepted booking.</p>
          </section>

          {/* H. reviews */}
          <section aria-labelledby="rv"><h2 id="rv">Reviews</h2>
            {Object.keys(bd).length ? <div className="grid g3" style={{ marginBottom: 12 }}>{Object.entries(bd).filter(([, v]) => v != null).map(([k, v]) => <div key={k} className="row between small"><span className="muted">{k.replace(/_/g, ' ')}</span><strong>{Number(v).toFixed(1)}</strong></div>)}</div> : null}
            {p.reviews.length ? <div className="stack">{p.reviews.map((r, i) => (
              <Card key={i} className="flat"><div className="row between"><Stars value={r.overall} /><span className="muted small">{new Date(r.created_at).toLocaleDateString('en-KE')}</span></div>
                <p style={{ margin: '6px 0' }}>{r.body}</p><p className="muted small" style={{ margin: 0 }}>{r.reviewer}{r.verified_booking ? ' · ✓ Verified booking' : ''}</p>
                {r.response ? <div className="card flat" style={{ marginTop: 8, background: 'var(--neutral-bg)' }}><strong className="small">Response from {n}</strong><p className="small" style={{ margin: 0 }}>{r.response}</p></div> : null}</Card>
            ))}</div> : <p className="muted">No reviews yet. Verified reviews appear after completed bookings.</p>}
          </section>
        </div>

        {/* I. actions */}
        <aside className="sticky"><Card><ProfileActions id={p.id} slug={p.slug} name={n} />
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />
          <p className="small muted" style={{ margin: 0 }}>Pay through FundiLink. The professional is paid after you confirm the work. Prices are shown before you pay.</p></Card></aside>
      </div>
    </main>
  );
}
