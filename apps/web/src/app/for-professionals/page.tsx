import Link from 'next/link';
import { Page } from '@/components/Page';
export const metadata = { title: 'Become a professional', description: 'Get discovered, manage bookings and get paid on FundiLink. Free registration.' };
export default function P() {
  return <Page title="Grow your business on FundiLink" lead="Get discovered by customers looking for your services. Manage bookings, showcase your work, build your reputation and receive payments in one place.">
    <ul><li>Free registration and a free public profile. Qualifications are optional so every skilled professional can join.</li><li>Low, simple commission on completed jobs only. No monthly fee to start.</li><li>Calendar, quotations, customer notes, earnings statements and payouts to M-Pesa or bank.</li><li>Work as an individual or as a company with several technicians.</li><li>Paying never buys ratings, verification or search ranking.</li></ul>
    <p className="muted">We cannot promise a number of jobs. Your reputation, availability and prices decide how often customers choose you.</p>
    <p><Link className="btn" href="/register?role=professional">Register as a professional</Link></p>
  </Page>;
}
