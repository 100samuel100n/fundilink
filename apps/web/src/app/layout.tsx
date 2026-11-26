import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Footer, Header } from '@/components/Header';
import { SITE_URL } from '@/lib/api';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const display = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-display', weight: ['600', '700', '800'] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'FundiLink: the right professional, without the guesswork', template: '%s | FundiLink' },
  description: 'Book verified plumbers, electricians, cleaners, painters and 100+ other professionals across Kenya. Compare prices, pay securely, review the work.',
  openGraph: { type: 'website', siteName: 'FundiLink', locale: 'en_KE' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#142A3B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>
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
