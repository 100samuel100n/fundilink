const LOCAL_PROBLEMS: { icon: 'droplet' | 'sparkles' | 'truck' | 'zap' | 'brush' | 'snowflake'; title: string; hint: string; nl: string }[] = [
  { icon: 'droplet', title: 'Leaking pipe?', hint: 'Plumbers who can come today', nl: 'I have a leaking pipe and need a plumber today' },
  { icon: 'sparkles', title: 'Need a deep clean?', hint: 'Homes, offices and move-outs', nl: 'I need a deep clean for my home' },
  { icon: 'truck', title: 'Moving house?', hint: 'Movers with transport included', nl: 'I need movers for moving house' },
  { icon: 'zap', title: 'Power problem?', hint: 'Licensed electricians', nl: 'I need an electrician for a power fault' },
  { icon: 'brush', title: 'Repainting?', hint: 'Compare quotes from painters', nl: 'I need a painter for a three-bedroom apartment' },
  { icon: 'snowflake', title: 'Fridge or AC broken?', hint: 'Appliance repair near you', nl: 'My fridge stopped cooling and I need a repair' },
];



import Link from 'next/link';
import { COUNTIES_FEATURED } from '@fundilink/sdk';
import { HeroSearch } from '@/components/HeroSearch';
import { NearbyPros } from '@/components/NearbyPros';
import { ProCardView } from '@/components/ProCard';
import { Card } from '@/components/ui';
import { CatIcon, Icon } from '@/components/Icon';
import { getCategories, getSearch } from '@/lib/server';
import { withoutSamples } from '@/lib/sample';

export const revalidate = 120;

const FALLBACK = ['plumbing', 'electrical', 'painting', 'cleaning', 'carpentry', 'appliance-repair', 'moving', 'construction'];
const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase());


export default async function Home() {
  const [cats, top] = await Promise.all([getCategories(), getSearch({ sort: 'rating', limit: 8 })]);
  const popular = (cats ?? []).slice(0, 7).map((c) => ({ slug: c.slug, name: c.name }));
  const tiles = popular.length ? popular : FALLBACK.slice(0, 7).map((s) => ({ slug: s, name: titleCase(s) }));
  const featured = withoutSamples(top?.results ?? []).slice(0, 4);
  // Only figures the API can actually back up.
  const listed = top ? withoutSamples(top.results).length && top.total : 0;

  return (
    <main id="main">
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow"><Icon name="shield" size={14} />Verified professionals · Pay safely with M-Pesa</span>
            <h1>The right professional.<br /><span>Without the guesswork.</span></h1>
            <p className="lead">Discover, compare and book trusted professionals for your home, business or next project. Prices are clear before you pay.</p>
            <HeroSearch />
            <div className="ticks">
              <span><Icon name="badgeCheck" size={18} />Verified identities</span>
              <span><Icon name="receipt" size={18} />Transparent pricing</span>
              <span><Icon name="lock" size={18} />Secure payments</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hcard a">
              <div className="who"><div className="avatar">JM</div><div><b>Your plumber is on the way</b><small>Verified · Arrives with tools</small></div><span className="badge good" style={{ marginLeft: 'auto' }}><span className="live-dot" /> Live</span></div>
              <div className="eta-row"><div><small className="muted">Arriving in</small><div className="big">12 min</div></div><div style={{ textAlign: 'right' }}><small className="muted">Start PIN</small><div className="big mono" style={{ fontSize: '1.4rem' }}>4 8 2 1</div></div></div>
            </div>
            <div className="hcard b">
              <div className="row between"><b style={{ fontFamily: 'var(--f-display)' }}>Pay KSh 4,500</b><span className="momo-tag"><i>M</i>M-Pesa</span></div>
              <p className="small muted" style={{ margin: '6px 0 0' }}>Held safely until you confirm the work.</p>
            </div>
            <div className="hcard c"><small>Extra work approved</small><br /><b>Replacement valve · KSh 2,000</b></div>
            <p className="small muted" style={{ position: 'absolute', bottom: -6, left: 8, margin: 0 }}>Illustration</p>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="wrap">
          <div className="t"><span className="ico"><Icon name="badgeCheck" size={20} /></span><div><b>Verified</b><small>Identity and qualifications</small></div></div>
          <div className="t"><span className="ico"><Icon name="receipt" size={20} /></span><div><b>Clear prices</b><small>Seen before you pay</small></div></div>
          <div className="t"><span className="ico"><Icon name="lock" size={20} /></span><div><b>Protected payment</b><small>Released after you confirm</small></div></div>
          <div className="t"><span className="ico"><Icon name="navigation" size={20} /></span><div><b>Live tracking</b><small>Know when they arrive</small></div></div>
        </div>
      </section>

      <section className="section wrap">
        <div className="sec-head"><div><h2>Explore services</h2><p>Over 100 kinds of professionals, one place.</p></div><Link href="/services">All services <Icon name="arrowRight" size={16} /></Link></div>
        <div className="grid g4">
          {tiles.map((c) => <Link key={c.slug} href={`/explore/${c.slug}`} className="card tile"><span className="e"><CatIcon slug={c.slug} size={24} /></span>{c.name}</Link>)}
          <Link href="/services" className="card tile"><span className="e"><Icon name="menu" size={24} /></span>More</Link>
        </div>
      </section>

      <section className="section wrap" style={{ paddingTop: 0 }}>
        <div className="sec-head"><h2>Start with the problem</h2></div>
        <div className="grid g3">
          {LOCAL_PROBLEMS.map((p) => (
  <Link key={p.title} className="card problem" href={`/explore?nl=${encodeURIComponent(p.nl)}`}>
    <span className="ico"><Icon name={p.icon} size={20} /></span>
    <span>{p.title}<small>{p.hint}</small></span>
  </Link>
))}
        </div>
      </section>

      <section className="band"><div className="section wrap">
        <div className="sec-head"><div><h2>How FundiLink works</h2><p>From problem to done in three steps.</p></div></div>
        <div className="steps3" style={{ marginTop: 28 }}>
          <div className="s"><h3>Tell us what you need</h3><p className="muted" style={{ margin: 0 }}>Describe the job and where it is. We show professionals who actually serve your area, with prices.</p></div>
          <div className="s"><h3>Book and pay safely</h3><p className="muted" style={{ margin: 0 }}>Pay in the app with M-Pesa and we hold it, or choose to pay the professional on site. Extra work is always approved in the app first.</p></div>
          <div className="s"><h3>Track, confirm, review</h3><p className="muted" style={{ margin: 0 }}>Watch them arrive, share your start PIN, confirm the work, then leave a review.</p></div>
        </div>
      </div></section>

      {featured.length ? (
        <section className="section wrap" style={{ paddingTop: 0 }}>
          <div className="sec-head"><h2>Recommended professionals</h2><Link href="/explore">View all <Icon name="arrowRight" size={16} /></Link></div>
          <div className="grid g2">{featured.map((p) => <ProCardView key={p.id} pro={p} />)}</div>
        </section>
      ) : null}

      <section className="section wrap" style={{ paddingTop: 0 }}><div className="sec-head"><h2>Professionals near you</h2></div><NearbyPros /></section>

      <section className="band"><div className="section wrap">
        <div className="feature">
          <div>
            <h2>How pricing works</h2>
            <p className="muted">You see what you will pay before you commit. No surprise add-ons at the door.</p>
            <ul className="checklist">
              <li><Icon name="check" size={18} /><span><strong>Fixed prices</strong> for standard jobs, shown on the professional’s profile.</span></li>
              <li><Icon name="check" size={18} /><span><strong>Quotations</strong> for bigger work. Compare itemised estimates from several professionals.</span></li>
              <li><Icon name="check" size={18} /><span><strong>Travel, materials and fees</strong> are listed separately, so you can compare like with like.</span></li>
              <li><Icon name="check" size={18} /><span><strong>Extra work</strong> needs your approval before anything more is charged.</span></li>
            </ul>
          </div>
          <div>
            <h2>How protection works</h2>
            <p className="muted">Booking through FundiLink keeps payment, messages and records in one place.</p>
            <ul className="checklist">
              <li><Icon name="shield" size={18} /><span><strong>Pay through the platform.</strong> The professional is paid after you confirm the work.</span></li>
              <li><Icon name="badgeCheck" size={18} /><span><strong>Separate badges</strong> for identity, qualifications and business registration. Never bought.</span></li>
              <li><Icon name="flag" size={18} /><span><strong>Disputes are handled by people</strong>, with a clear timeline on the booking.</span></li>
              <li><Icon name="navigation" size={18} /><span><strong>Live arrival tracking</strong> during an accepted journey. Location is never public.</span></li>
            </ul>
            <p style={{ marginTop: 12 }}><Link href="/safety" style={{ fontWeight: 600, color: 'var(--brand-dark)' }}>Read about safety <Icon name="arrowRight" size={16} /></Link></p>
          </div>
        </div>
      </div></section>

      <section className="section wrap">
        <div className="feature">
          <div>
            <h2>For property owners and managers</h2>
            <p className="muted">Keep every property maintained without chasing people on WhatsApp.</p>
            <ul className="checklist">
              <li><Icon name="repeat" size={18} /><span>Recurring cleaning, pest control, servicing and garden care.</span></li>
              <li><Icon name="building" size={18} /><span>Several properties and team members under one account.</span></li>
              <li><Icon name="fileCheck" size={18} /><span>Service history, invoices and statements in one place.</span></li>
            </ul>
            <div className="row wrap-r" style={{ marginTop: 16 }}><Link className="btn" href="/for-businesses">For businesses</Link><Link className="btn ghost" href="/app/recurring">Set up a recurring service</Link></div>
          </div>
          <Card className="flat">
            <div className="row" style={{ gap: 14 }}><span className="ico"><Icon name="repeat" size={20} /></span><div><strong>Weekly office cleaning</strong><div className="muted small">Every Monday, 7:00. Same team. Invoiced monthly.</div></div></div>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' }} />
            <div className="row" style={{ gap: 14 }}><span className="ico"><Icon name="snowflake" size={20} /></span><div><strong>Quarterly AC servicing</strong><div className="muted small">Reminder a week before. Service history saved.</div></div></div>
            <p className="muted small" style={{ margin: '12px 0 0' }}>Illustration of how recurring services look once set up.</p>
          </Card>
        </div>
      </section>

      <section className="section wrap" style={{ paddingTop: 0 }}>
        <div className="panel-ink">
          <div className="feature">
            <div>
              <h2>Are you a skilled professional?</h2>
              <p>Win work from genuine customers, manage bookings and quotations, build a portfolio and get paid through one platform. Registration is free.</p>
              <div className="row wrap-r"><Link className="btn" href="/for-professionals">Become a professional</Link><Link className="btn ghost" href="/how-it-works">How it works</Link></div>
            </div>
            <ul className="checklist" style={{ color: '#fff' }}>
              <li><Icon name="calendar" size={18} />Calendar, availability and job management</li>
              <li><Icon name="receipt" size={18} />Quotation builder and clear commission statements</li>
              <li><Icon name="image" size={18} />A portfolio that shows your work, not just a description</li>
              <li><Icon name="users" size={18} />Team tools for businesses with several technicians</li>
            </ul>
          </div>
        </div>
      </section>

      {listed ? (
        <section className="section wrap" style={{ paddingTop: 0 }}>
          <div className="stats-strip">
            <div><b>{listed}</b><span className="muted small">professionals listed</span></div>
            {cats?.length ? <div><b>{cats.length}</b><span className="muted small">service categories</span></div> : null}
          </div>
        </section>
      ) : null}

      <section className="section wrap" style={{ paddingTop: 0 }}>
        <div className="sec-head"><h2>Popular locations</h2></div>
        <div className="chips">
          {COUNTIES_FEATURED.map((c) => <Link key={c} className="chip" href={`/locations/${c.toLowerCase()}`}>{c}</Link>)}
          <Link className="chip" href="/locations">All locations</Link>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>Availability varies by area. Search shows the professionals who actually serve your location.</p>
      </section>
    </main>
  );
}
