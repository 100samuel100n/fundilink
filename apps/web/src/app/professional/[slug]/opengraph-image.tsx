import { ogCard } from '@/lib/og';
import { getProfile } from '@/lib/server';
export const alt = 'FundiLink professional';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getProfile(slug);
  if (!p) return ogCard({ title: 'FundiLink', subtitle: 'Verified professionals across Kenya' });
  const rating = p.stats.reviews > 0 ? `${Number(p.stats.rating).toFixed(1)}/5 from ${p.stats.reviews} reviews` : 'New on FundiLink';
  return ogCard({ eyebrow: 'FundiLink professional', title: p.businessName ?? p.name, subtitle: [p.headline, rating].filter(Boolean).join('  ·  ') });
}