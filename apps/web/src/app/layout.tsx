import { JsonLd } from '@/components/JsonLd';
import { organizationLd, websiteLd } from '@/lib/seo';
import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Footer, Header } from '@/components/Header';
import { SITE_URL } from '@/lib/api';


const TITLE = 'FundiLink: hire trusted plumbers, electricians, cleaners and more in Kenya';
const DESC = 'Book verified plumbers, electricians, cleaners, painters and 100+ other professionals across Kenya. Compare prices and reviews, pay securely with M-Pesa.';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const display = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-display', weight: ['600', '700', '800'] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: 'FundiLink',
  title: { default: TITLE, template: '%s | FundiLink' },
  description: DESC,
  keywords: ['hire a fundi', 'plumber Nairobi', 'electrician Kenya', 'cleaners Nairobi', 'painters Kenya', 'home services Kenya', 'trusted professionals Kenya', 'book fundi online', 'M-Pesa'],
  openGraph: { type: 'website', siteName: 'FundiLink', locale: 'en_KE', title: TITLE, description: DESC },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  formatDetection: { telephone: false },
  category: 'Home services',
  verification: { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION || undefined, other: process.env.NEXT_PUBLIC_BING_VERIFICATION ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION } : undefined },
  other: { 'geo.region': 'KE', 'geo.placename': 'Kenya' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#142A3B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-KE" className={`${inter.variable} ${display.variable}`}>
      <body>
        <JsonLd data={[organizationLd(), websiteLd()]} />
        <a className="skip" href="#main">Skip to content</a>
        <Providers>
          <Header />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
