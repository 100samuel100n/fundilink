/**
 * Seeds demo accounts, professionals in EVERY county, and bookings you can test end to end (including the en-route flow).
 *
 *   npm run seed:demo           (from the repo root; needs DATABASE_URL, and the API running if you want the sample bookings)
 *   npm run seed:demo:purge -w @fundilink/api   -> deactivates every demo account and hides demo professionals
 *
 * Idempotent: running it twice does not duplicate anything. Bookings are created through the real API (same code path as the apps),
 * so ledger entries, receipts and the state machine are genuine.
 */
import '../env.ts';
import * as argon2 from 'argon2';
import { Pool } from 'pg';
import { DEMO_DOMAIN, DEMO_PASSWORD, DEMO_USERS } from '../demo-data.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString: url, ssl: /proxy\.rlwy\.net|\.railway\.app|sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
const q = async <T = any>(text: string, p: any[] = []) => (await pool.query(text, p)).rows as T[];
const one = async <T = any>(text: string, p: any[] = []) => (await q<T>(text, p))[0];

const purge = process.argv.includes('--purge');
const noBookings = process.argv.includes('--no-bookings');
const API = (process.env.SEED_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');

/* ---------- professionals ---------- */
interface ProDef {
  key: string; display: string; business?: string; account: 'individual' | 'business'; cats: string[]; county: string; area: string; lat: number; lng: number;
  years: number; emergency?: boolean; autoAccept?: boolean; rating: number; reviews: number; jobs: number; headline: string; qualified?: boolean;
}
const NAMED: ProDef[] = [
  { key: 'juma', display: 'Juma Kamau', business: 'Juma Plumbing Services', account: 'individual', cats: ['plumbing'], county: 'Nairobi', area: 'South C', lat: -1.32, lng: 36.825, years: 9, emergency: true, rating: 4.8, reviews: 64, jobs: 112, headline: 'Leaks, blocked drains, bathrooms & water tanks. Same-day in Nairobi.' },
  { key: 'wanjiku', display: 'Wanjiku Mwangi', business: 'Wanjiku Electricals', account: 'individual', cats: ['electrical'], county: 'Nairobi', area: 'Westlands', lat: -1.2676, lng: 36.8108, years: 12, emergency: true, rating: 4.9, reviews: 88, jobs: 160, headline: 'Licensed electrician: wiring, sockets, DB boards, inspections.', qualified: true },
  { key: 'achieng', display: 'Achieng Odhiambo', business: 'Lake Painters Kisumu', account: 'individual', cats: ['painting'], county: 'Kisumu', area: 'Kondele', lat: -0.095, lng: 34.74, years: 7, rating: 4.7, reviews: 31, jobs: 54, headline: 'Interior & exterior painting across Kisumu.' },
  { key: 'sparkle', display: 'Sparkle Clean Ltd', business: 'Sparkle Clean Ltd', account: 'business', cats: ['cleaning', 'pest-control'], county: 'Mombasa', area: 'Nyali', lat: -4.02, lng: 39.715, years: 6, rating: 4.6, reviews: 41, jobs: 90, headline: 'Homes, offices and post-construction cleaning. Team of 8.', qualified: true },
];
// one professional in every county, so every county page and map has someone to find
const ROTATE = ['plumbing', 'electrical', 'cleaning', 'painting', 'carpentry', 'appliance-repair', 'ac-refrigeration', 'gardening', 'security-cctv', 'it-support', 'automotive', 'roofing', 'moving', 'locksmith', 'welding'];
const FIRST = ['Kevin', 'Mercy', 'Peter', 'Faith', 'Hassan', 'Naomi', 'Daniel', 'Lucy', 'Ali', 'Joyce', 'Samuel', 'Esther', 'Abdi', 'Rose', 'Moses'];
const LAST = ['Mutua', 'Kiplagat', 'Barasa', 'Njoroge', 'Ochieng', 'Chebet', 'Hussein', 'Wafula', 'Mwende', 'Kariuki', 'Lekishon', 'Omondi', 'Kiprop', 'Nyaga', 'Salim'];
const NICE: Record<string, string> = { plumbing: 'Plumbers', electrical: 'Electricals', cleaning: 'Cleaning Services', painting: 'Painters', carpentry: 'Carpenters', 'appliance-repair': 'Appliance Repair', 'ac-refrigeration': 'Cooling Tech', gardening: 'Landscapers', 'security-cctv': 'Security Systems', 'it-support': 'IT Support', automotive: 'Auto Garage', roofing: 'Roofing', moving: 'Movers', locksmith: 'Locksmiths', welding: 'Welders' };
const countyPros = (COUNTIES: { name: string; hq: string; lat: number; lng: number }[]): ProDef[] => COUNTIES.map((c, i) => {
  const cat = ROTATE[i % ROTATE.length]; const nm = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  const j = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280 - 0.5; // deterministic scatter within ~2 km of the HQ
  return { key: `c${i}`, display: nm, business: `${c.name} ${NICE[cat]}`, account: 'individual', cats: [cat], county: c.name, area: c.hq, lat: c.lat + j(1) * 0.03, lng: c.lng + j(2) * 0.03, years: 3 + (i % 12), emergency: ['plumbing', 'electrical', 'locksmith', 'automotive'].includes(cat), rating: 4.2 + (i % 8) / 10, reviews: 6 + ((i * 5) % 40), jobs: 10 + ((i * 11) % 90), headline: `Trusted ${NICE[cat].toLowerCase()} serving ${c.name} County.` };
});

const PRICING = [['fixed', 150_000], ['hourly', 80_000], ['call_out', 100_000], ['quotation', null], ['fixed', 250_000], ['per_unit', 60_000]] as const;

async function main() {
  if (purge) {
    const u = await q(`UPDATE users SET status='suspended' WHERE is_demo RETURNING id`);
    await q(`UPDATE professional_profiles SET status='deactivated', searchable=false WHERE user_id IN (SELECT id FROM users WHERE is_demo)`);
    console.log(`Deactivated ${u.length} demo accounts and hid their profiles.`); return;
  }

  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const roleId = async (code: string) => (await one<{ id: number }>('SELECT id FROM roles WHERE code=$1', [code]))!.id;
  const grant = async (uid: string, code: string) => q('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, await roleId(code)]);

  /* ---- users ---- */
  const uid: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const r = await one<{ id: string }>(
      `INSERT INTO users (email, phone, password_hash, full_name, phone_verified_at, email_verified_at, is_demo, status) VALUES ($1,$2,$3,$4, now(), now(), true, 'active')
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, status='active', is_demo=true, full_name=EXCLUDED.full_name RETURNING id`, [u.email, u.phone, hash, u.name]);
    uid[u.key] = r!.id;
    if (u.role === 'admin') await grant(r!.id, 'super_admin');
    if (u.role === 'customer' || u.role === 'org') { await grant(r!.id, 'customer'); await q(`INSERT INTO customer_profiles (user_id, referral_code) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r!.id, u.key + 'ref']); }
    if (u.role === 'professional') await grant(r!.id, 'professional');
    if (u.role === 'tech') await grant(r!.id, 'business_member');
    if (u.role === 'org') await grant(r!.id, 'org_member');
  }
  console.log(`✓ ${DEMO_USERS.length} demo users`);

  /* ---- professionals ---- */
  const cat = async (slug: string) => (await one<{ id: number }>('SELECT id FROM categories WHERE slug=$1', [slug]))?.id;
  const proId: Record<string, string> = {};
  const counties = (await q<{ name: string; lat: number; lng: number }>(`SELECT county AS name, ST_Y(centre::geometry) lat, ST_X(centre::geometry) lng FROM service_locations WHERE town IS NULL AND country_code='KE' AND centre IS NOT NULL ORDER BY county`)).map((c) => ({ ...c, hq: c.name }));
  if (counties.length < 47) { throw new Error(`Only ${counties.length} counties found in service_locations. Run  npm run db:migrate  first (migration 004 adds all 47).`); }
  const COUNTY_PROS = countyPros(counties);
  const COUNTIES = counties;
  const all = [...NAMED, ...COUNTY_PROS];
  for (const [n, p] of all.entries()) {
    const userId = uid[p.key] ?? (await one<{ id: string }>(
      `INSERT INTO users (email, phone, password_hash, full_name, phone_verified_at, email_verified_at, is_demo) VALUES ($1,$2,$3,$4, now(), now(), true)
       ON CONFLICT (email) DO UPDATE SET is_demo=true, status='active' RETURNING id`, [`${p.key}@${DEMO_DOMAIN}`, `+2547001${String(n).padStart(5, '0')}`, hash, p.display]))!.id;
    if (!uid[p.key]) await grant(userId, 'professional');
    const slug = (p.business ?? p.display).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + (p.key.startsWith('c') ? `-${p.key}` : '');
    const row = await one<{ id: string }>(
      `INSERT INTO professional_profiles (user_id, account_type, slug, display_name, business_name, headline, bio, years_experience, base_location, base_area, county,
         max_travel_km, free_radius_km, per_km_amount, min_call_out, accepts_emergency, auto_accept, status, activated_at, founding_member, rating_avg, rating_count, completed_jobs, completion_rate, cancellation_rate, avg_response_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ST_SetSRID(ST_MakePoint($9,$10),4326)::geography, $11,$12, 20,5,3000,50000,$13,false,'active', now(), true, $14,$15,$16, 0.97, 0.02, $17)
       ON CONFLICT (slug) DO UPDATE SET status='active', searchable=true, base_location=EXCLUDED.base_location, county=EXCLUDED.county RETURNING id`,
      [userId, p.account, slug, p.display, p.business ?? null, p.headline, `${p.headline} Based in ${p.area}, ${p.county}. Demo profile for testing.`, p.years, p.lng, p.lat, p.area, p.county, !!p.emergency, p.rating.toFixed(2), p.reviews, p.jobs, 8 + (n % 25)]);
    const pid = row!.id; proId[p.key] = pid;
    for (const [i, slugc] of p.cats.entries()) {
      const cid = await cat(slugc); if (!cid) continue;
      await q('INSERT INTO professional_categories (professional_id, category_id, is_primary) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [pid, cid, i === 0]);
      const svcs = await q<{ id: number; name: string }>('SELECT id, name FROM services WHERE category_id=$1 ORDER BY id', [cid]);
      for (const [si, s] of svcs.entries()) {
        const ps = await one<{ id: string }>(`INSERT INTO professional_services (professional_id, service_id, title, description, duration_minutes, warranty_days) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (professional_id, service_id) DO UPDATE SET enabled=true RETURNING id`, [pid, s.id, s.name, `${s.name} by ${p.business ?? p.display}.`, 60 + (si % 3) * 30, si % 2 ? 30 : null]);
        const [model, amount] = PRICING[(si + n) % PRICING.length];
        const has = await one('SELECT 1 FROM service_pricing WHERE professional_service_id=$1', [ps!.id]);
        if (!has) await q(`INSERT INTO service_pricing (professional_service_id, model, amount, min_charge, unit_label, emergency_amount) VALUES ($1,$2::pricing_model,$3,$4,$5,$6)`,
          [ps!.id, model, amount === null ? null : amount + (n % 5) * 20_000, 50_000, model === 'hourly' ? 'hour' : model === 'per_unit' ? 'unit' : null, p.emergency && amount ? Math.round(amount * 1.5) : null]);
      }
    }
    if (!(await one('SELECT 1 FROM professional_availability WHERE professional_id=$1', [pid])))
      for (let d = 0; d < 7; d++) await q('INSERT INTO professional_availability (professional_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)', [pid, d, d === 0 ? '10:00' : '07:00', d === 0 ? '16:00' : '19:00']);
    if (!(await one('SELECT 1 FROM professional_service_areas WHERE professional_id=$1', [pid]))) await q('INSERT INTO professional_service_areas (professional_id, county, town) VALUES ($1,$2,$3)', [pid, p.county, p.area]);
    const levels = ['basic', 'identity', ...(p.qualified ? ['qualification'] : []), ...(p.account === 'business' ? ['business'] : [])];
    for (const level of levels) await q(`INSERT INTO professional_verifications (professional_id, level, state, reviewed_at) SELECT $1,$2::verification_level,'approved', now() WHERE NOT EXISTS (SELECT 1 FROM professional_verifications WHERE professional_id=$1 AND level=$2::verification_level)`, [pid, level]);
    if (!(await one('SELECT 1 FROM payout_accounts WHERE professional_id=$1', [pid])))
      await q(`INSERT INTO payout_accounts (professional_id, kind, provider, account_ref_encrypted, account_name, name_verified_at) VALUES ($1,'mobile_money','mpesa', convert_to($2,'UTF8'), $3, now())`, [pid, `+2547001${String(n).padStart(5, '0')}`, p.display]);
  }
  // business team
  await q(`INSERT INTO business_members (business_id, user_id, role) VALUES ($1,$2,'technician') ON CONFLICT DO NOTHING`, [proId.sparkle, uid.tech]);
  console.log(`✓ ${all.length} professionals (${COUNTIES.length} counties covered)`);

  /* ---- saved locations ---- */
  const loc = async (u: string, label: string, address: string, lat: number, lng: number) => q(`INSERT INTO saved_locations (user_id, label, address, location) SELECT $1,$2,$3, ST_SetSRID(ST_MakePoint($5,$4),4326)::geography WHERE NOT EXISTS (SELECT 1 FROM saved_locations WHERE user_id=$1 AND label=$2)`, [u, label, address, lat, lng]);
  await loc(uid.amina, 'Home', 'Argwings Kodhek Rd, Kilimani, Nairobi', -1.2905, 36.787);
  await loc(uid.amina, 'Office', 'Waiyaki Way, Westlands, Nairobi', -1.2640, 36.8030);
  await loc(uid.brian, 'Home', 'Tom Mboya St, Kisumu', -0.0917, 34.768);

  /* ---- enterprise org ---- */
  const org = (await one<{ id: string }>(`SELECT id FROM organizations WHERE name='Prime Properties Ltd'`)) ?? (await one<{ id: string }>(`INSERT INTO organizations (name, kind, billing_email) VALUES ('Prime Properties Ltd','property_management',$1) RETURNING id`, [`manager@${DEMO_DOMAIN}`]));
  await q(`INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`, [org!.id, uid.org]);
  await q(`INSERT INTO properties (organization_id, name, address, location, manager_id) SELECT $1,'Kilimani Heights','Ngong Rd, Kilimani, Nairobi', ST_SetSRID(ST_MakePoint(36.7872,-1.2896),4326)::geography, $2 WHERE NOT EXISTS (SELECT 1 FROM properties WHERE organization_id=$1)`, [org!.id, uid.org]);
  await q(`INSERT INTO promotional_campaigns (code, kind, value, max_redemptions, per_user_limit) VALUES ('WELCOME10','percent',1000,1000,1) ON CONFLICT DO NOTHING`);
  console.log('✓ locations, enterprise org, WELCOME10 promo');

  if (!noBookings) await bookings();
  console.log(`\nDone. Sign in with  <email>  /  ${DEMO_PASSWORD}`);
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(12)} ${u.email.padEnd(34)} ${u.note}`);
}

/* ---------- bookings through the real API ---------- */
async function api(path: string, method = 'GET', token?: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); const j = t ? JSON.parse(t) : undefined;
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 200)}`);
  return j;
}
const login = async (email: string) => (await api('/auth/login', 'POST', undefined, { identifier: email, password: DEMO_PASSWORD })).accessToken as string;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bookings() {
  try { await fetch(`${API}/health`); } catch { console.log(`\n⚠ API not reachable at ${API}: users, professionals and locations are seeded. Start the API and run  npm run seed:demo  again to create the sample bookings.`); return; }
  const existing = await one<{ n: string }>(`SELECT count(*) n FROM bookings b JOIN users u ON u.id=b.customer_id WHERE u.is_demo`);
  if (Number(existing?.n) > 0) { console.log('✓ demo bookings already exist (use the "Reset demo job" button in the app to replay a journey)'); return; }

  const first = async (slug: string, proKey: string) => one<{ id: string; psid: string }>(`SELECT ps.id psid, ps.id FROM professional_services ps JOIN services s ON s.id=ps.service_id JOIN categories c ON c.id=s.category_id WHERE ps.professional_id=$1 AND c.slug=$2 ORDER BY s.id LIMIT 1`, [proId_(proKey), slug]);
  const proId_ = (k: string) => PROMAP[k];
  const PROMAP: Record<string, string> = Object.fromEntries((await q<{ slug: string; id: string }>(`SELECT id, slug FROM professional_profiles WHERE slug = ANY($1)`, [['juma-plumbing-services', 'wanjiku-electricals', 'lake-painters-kisumu', 'sparkle-clean-ltd']])).map((r) => [({ 'juma-plumbing-services': 'juma', 'wanjiku-electricals': 'wanjiku', 'lake-painters-kisumu': 'achieng', 'sparkle-clean-ltd': 'sparkle' } as any)[r.slug], r.id]));

  const plan = [
    { cust: 'amina', pro: 'juma', cat: 'plumbing', hours: 4, desc: 'Water leaking under the kitchen sink, drips constantly.', addr: 'Argwings Kodhek Rd, Kilimani, Nairobi', lat: -1.2905, lng: 36.787, stage: 'scheduled', label: 'Leak repair' },
    { cust: 'amina', pro: 'wanjiku', cat: 'electrical', hours: 27, desc: 'Two sockets in the lounge are not working and one sparks.', addr: 'Argwings Kodhek Rd, Kilimani, Nairobi', lat: -1.2905, lng: 36.787, stage: 'scheduled', label: 'Socket repair' },
    { cust: 'amina', pro: 'wanjiku', cat: 'electrical', hours: 50, desc: 'Install 6 new LED downlights in the bedroom.', addr: 'Waiyaki Way, Westlands, Nairobi', lat: -1.264, lng: 36.803, stage: 'awaiting_acceptance', label: 'Lighting install' },
    { cust: 'amina', pro: 'juma', cat: 'plumbing', hours: 75, desc: 'Replace the kitchen tap and fit a new mixer.', addr: 'Argwings Kodhek Rd, Kilimani, Nairobi', lat: -1.2905, lng: 36.787, stage: 'pending_payment', label: 'Tap installation' },
    { cust: 'brian', pro: 'achieng', cat: 'painting', hours: 5, desc: 'Paint one living room (interior), walls only.', addr: 'Tom Mboya St, Kisumu', lat: -0.0917, lng: 34.768, stage: 'scheduled', label: 'Interior painting' },
  ];
  const tokens: Record<string, string> = {};
  const tok = async (k: string) => (tokens[k] ??= await login(DEMO_USERS.find((u) => u.key === k)!.email));
  for (const b of plan) {
    try {
      const ps = await first(b.cat, b.pro); if (!ps) continue;
      const cT = await tok(b.cust);
      const starts = new Date(Date.now() + b.hours * 3_600_000 + 3_600_000);
      const res = await api('/bookings', 'POST', cT, {
        professionalId: PROMAP[b.pro], professionalServiceId: ps.psid, kind: 'scheduled', description: b.desc, address: b.addr, lat: b.lat, lng: b.lng,
        startsAt: starts.toISOString(), durationMinutes: 90, lines: [{ label: b.label, kind: 'labour', quantity: 1, unitAmount: 250_000 }, { label: 'Materials', kind: 'materials', quantity: 1, unitAmount: 80_000 }],
      });
      const id = res.booking.id as string;
      if (b.stage === 'pending_payment') { console.log(`  • ${res.booking.reference}  ${b.label}: awaiting payment (pay it in the app)`); continue; }
      await api('/payments', 'POST', cT, { bookingId: id, method: 'mpesa', phone: '+254700000010', idempotencyKey: `seed-${id}-pay-001` });
      let st = ''; for (let i = 0; i < 20 && st !== 'awaiting_acceptance'; i++) { await sleep(700); st = (await api(`/bookings/${id}`, 'GET', cT)).status; }
      if (b.stage === 'scheduled') {
        const pT = await tok(b.pro === 'sparkle' ? 'sparkle' : b.pro);
        await api(`/bookings/${id}/transition`, 'POST', pT, { to: 'confirmed' });
        await api(`/bookings/${id}/transition`, 'POST', pT, { to: 'scheduled' });
      }
      console.log(`  • ${res.booking.reference}  ${b.label}: ${b.stage.replace('_', ' ')}`);
    } catch (e: any) { console.log(`  ✗ ${b.label}: ${e.message}`); }
  }
}

/** Called by the API itself on boot when SEED_DEMO_ON_BOOT=true (staging convenience). */
export const runSeed = () => main();
if (require.main === module) main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
