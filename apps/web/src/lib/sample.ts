import type { ProCard } from '@fundilink/sdk';

/** Seeded demo/sample professionals must never appear as marketplace evidence in production. */
const SHOW = process.env.NEXT_PUBLIC_SHOW_SAMPLE_CONTENT === '1';
const SAMPLE = /\b(demo|sample|test profile|lorem|placeholder)\b/i;
export const isSampleProfile = (p: Pick<ProCard, 'name' | 'businessName' | 'headline'>) => !SHOW && SAMPLE.test(`${p.name} ${p.businessName ?? ''} ${p.headline ?? ''}`);
export const withoutSamples = <T extends Pick<ProCard, 'name' | 'businessName' | 'headline'>>(l: T[]) => l.filter((p) => !isSampleProfile(p));
