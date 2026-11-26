import type { Metadata } from 'next';
import { SITE_URL } from './api';
import { SITE } from './site';

export const abs = (path = '/') => `${SITE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
export const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
export const jsonLdString = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

/** Per-page metadata with its own canonical, Open Graph and Twitter tags (never inherit the homepage canonical). */
export function pageMeta({ title, description, path, noindex }: { title: string; description: string; path: string; noindex?: boolean }): Metadata {
  const full = `${title} | ${SITE.name}`;
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE.name, locale: 'en_KE', url: path, title: full, description },
    twitter: { card: 'summary_large_image', title: full, description },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export const breadcrumb = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
});
export const itemList = (name: string, items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'ItemList', name,
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: abs(it.path) })),
});
export const faqLd = (faqs: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
export const organizationLd = () => ({
  '@context': 'https://schema.org', '@type': 'Organization', '@id': abs('/#org'), name: SITE.name, legalName: SITE.company, url: abs('/'), logo: abs('/logo.png'),
  email: SITE.supportEmail, ...(SITE.supportPhone ? { telephone: SITE.supportPhone } : {}),
  areaServed: { '@type': 'Country', name: 'Kenya' },
  sameAs: Object.values(SITE.social).filter(Boolean),
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: SITE.supportEmail, availableLanguage: ['en', 'sw'], areaServed: 'KE' }],
});
export const websiteLd = () => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs('/#website'), url: abs('/'), name: SITE.name, inLanguage: 'en-KE', publisher: { '@id': abs('/#org') },
  potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${abs('/explore')}?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
});