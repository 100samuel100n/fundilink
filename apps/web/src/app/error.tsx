'use client';
import { Button, LinkButton, StateCard } from '@/components/ui';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="wrap narrow section">
      <StateCard tone="bad" icon="alertCircle" title="Something went wrong on our side" body="The page could not load. This is usually temporary."
        actions={<><Button onClick={reset}>Try again</Button><LinkButton tone="secondary" href="/">Go home</LinkButton></>} />
    </main>
  );
}