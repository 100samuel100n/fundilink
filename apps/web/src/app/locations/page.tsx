import Link from 'next/link';
import type { Metadata } from 'next';
import { COUNTIES, COUNTIES_FEATURED, COUNTY_REGIONS, slugify } from '@fundilink/sdk';
export const metadata: Metadata = { title: 'Locations', description: 'Find professionals in every Kenyan county and town.' };
export default function Locations() {
  return (
    <main id="main" className="wrap section"><h1>Locations</h1><p className="muted">We serve all 47 counties and hundreds of towns and estates. Pick yours.</p>
      <h2>Popular</h2><div className="chips">{COUNTIES_FEATURED.map((c) => <Link key={c} className="chip on" href={`/locations/${slugify(c)}`}>{c}</Link>)}</div>
      {COUNTY_REGIONS.map((r) => (
        <section key={r} style={{ marginTop: 24 }}><h2>{r}</h2>
          <div className="chips">{COUNTIES.filter((c) => c.region === r).map((c) => <Link key={c.name} className="chip" href={`/locations/${slugify(c.name)}`}>{c.name}</Link>)}</div>
        </section>
      ))}
    </main>
  );
}
