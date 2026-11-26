import type { Metadata } from 'next';
import { LinkButton, StateCard } from '@/components/ui';
export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: true } };
export default function NotFound() {
  return (
    <main id="main" className="wrap narrow section">
      <StateCard icon="search" title="We could not find that page" body="The link may be old or mistyped. Try searching for a professional or head back home."
        actions={<><LinkButton href="/explore">Find a professional</LinkButton><LinkButton tone="secondary" href="/">Go home</LinkButton></>} />
    </main>
  );
}