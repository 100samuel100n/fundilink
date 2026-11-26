'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Button, Card, PageTitle } from '@/components/ui';

export default function Settings() {
  const { roles, isPro, signOut } = useAuth();
  return (
    <><PageTitle title="Settings" />
      <Card><h3>Account</h3><p className="muted small">Roles: {roles.join(', ')}</p>
        {isPro ? <Link className="btn secondary" href="/professional">Switch to professional dashboard</Link> : <Link className="btn secondary" href="/professional/onboarding">Become a professional</Link>}
        <p className="small muted" style={{ marginTop: 16 }}>Notification preferences, two-factor authentication and session management will appear here once the API exposes them. Essential alerts (bookings, payments, safety) are always sent.</p>
        <Button tone="danger" onClick={() => signOut()}>Sign out</Button></Card></>
  );
}
