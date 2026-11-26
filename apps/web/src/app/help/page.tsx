import Link from 'next/link';
import { Page } from '@/components/Page';
export const metadata = { title: 'Help centre' };
const FAQ: [string, string][] = [
  ['How do I book a professional?', 'Find one, choose a service, pick a date and address, review the price breakdown, then pay. The professional confirms your booking.'],
  ['How do refunds work?', 'If a booking is cancelled or the work is disputed, request a refund from the booking page. Refunds go back through your original payment method after review.'],
  ['How do I cancel?', 'Open the booking and choose Cancel. Fees depend on how close the appointment is and whether the professional is already travelling.'],
  ['Where is my professional?', 'Once they accept and start their journey, open the booking and choose Track to see them live on the map.'],
  ['The price changed. What now?', 'A professional cannot raise the price without your approval. You will see a revision with the reason and extra costs, and you can approve or decline it.'],
  ['How do I become verified?', 'Register as a professional, upload your ID and any certificates. Our team reviews them; identity, qualification and business badges are separate.'],
];
export default function P() {
  return <Page title="Help centre" lead="Quick answers. Sensitive cases go to a person.">
    {FAQ.map(([q, a]) => <details key={q} className="card flat" style={{ marginBottom: 8 }}><summary style={{ fontWeight: 700, cursor: 'pointer' }}>{q}</summary><p style={{ marginTop: 8 }}>{a}</p></details>)}
    <p style={{ marginTop: 20 }}><Link className="btn" href="/app/support">Ask the assistant</Link> <Link className="btn ghost" href="/contact">Contact us</Link></p>
  </Page>;
}
