/** Seeded demo accounts. Only usable when the database was seeded with `npm run seed:demo` (and listed by the API only when ENABLE_DEMO=true). */
export const DEMO_PASSWORD = 'Demo@12345';
export const DEMO_DOMAIN = 'demo.fundilink.test';

export interface DemoUser {
  key: string; email: string; phone: string; name: string; role: 'customer' | 'professional' | 'admin' | 'org' | 'tech'; note: string;
}
export const DEMO_USERS: DemoUser[] = [
  { key: 'admin', email: `admin@${DEMO_DOMAIN}`, phone: '+254700000001', name: 'Demo Super Admin', role: 'admin', note: 'Full admin panel (/admin): users, verification, finance, disputes, locations, roles, audit logs.' },
  { key: 'amina', email: `amina@${DEMO_DOMAIN}`, phone: '+254700000010', name: 'Amina Wanjiru', role: 'customer', note: 'Nairobi customer with 4 bookings: 2 ready for the en-route test, 1 awaiting acceptance, 1 awaiting payment.' },
  { key: 'brian', email: `brian@${DEMO_DOMAIN}`, phone: '+254700000011', name: 'Brian Otieno', role: 'customer', note: 'Kisumu customer with a booking ready for the en-route test.' },
  { key: 'juma', email: `juma@${DEMO_DOMAIN}`, phone: '+254700000020', name: 'Juma Kamau', role: 'professional', note: 'Plumber (Nairobi). Has Amina\'s plumbing job: tap "Start journey" and drive it with the simulator.' },
  { key: 'wanjiku', email: `wanjiku@${DEMO_DOMAIN}`, phone: '+254700000021', name: 'Wanjiku Electricals', role: 'professional', note: 'Electrician (Nairobi), emergency-capable. Has one ready job and one pending request to accept.' },
  { key: 'achieng', email: `achieng@${DEMO_DOMAIN}`, phone: '+254700000022', name: 'Achieng Odhiambo', role: 'professional', note: 'Painter (Kisumu). Has Brian\'s job ready for the en-route test.' },
  { key: 'sparkle', email: `sparkle@${DEMO_DOMAIN}`, phone: '+254700000023', name: 'Sparkle Clean Ltd (owner)', role: 'professional', note: 'Business account (Mombasa) with a team: use it to test team management and business analytics.' },
  { key: 'tech', email: `tech@${DEMO_DOMAIN}`, phone: '+254700000024', name: 'Said Mwinyi (technician)', role: 'tech', note: 'Technician inside Sparkle Clean Ltd.' },
  { key: 'org', email: `manager@${DEMO_DOMAIN}`, phone: '+254700000030', name: 'Grace Njeri (Prime Properties)', role: 'org', note: 'Enterprise portal (/enterprise): properties, maintenance requests, contracts, statements.' },
];
