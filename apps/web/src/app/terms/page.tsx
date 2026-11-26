import { Page } from '@/components/Page';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Terms of service' };
export default function P() {
  return (
    <Page title="Terms of service" lead={`These terms govern your use of FundiLink, operated by ${SITE.company}. Last updated 11 November 2026.`}>
      <h2>1. What FundiLink is</h2>
      <p>FundiLink is a platform that helps customers find, compare, book and pay independent professionals. Professionals are not employees or agents of FundiLink. The service contract for a job is between the customer and the professional; FundiLink coordinates discovery, booking, payment, messaging, reviews and dispute handling.</p>
      <h2>2. Accounts</h2>
      <p>You must give accurate information, keep your sign-in details secure, and be at least 18 years old to book or offer services. You are responsible for activity on your account. We may suspend accounts that break these terms or put others at risk.</p>
      <h2>3. Prices, fees and payment</h2>
      <p>The price, travel charge, materials, platform fee and any taxes are shown before you pay. Payments are processed by a licensed payment partner. Your payment is held and released to the professional after you confirm the work is complete, or as set out in section 5. Extra work or a revised quotation needs your approval before it is charged.</p>
      <h2>4. Quotations and urgent jobs</h2>
      <p>A quotation is an offer by the professional for the scope described. If the scope changes, the professional must send a revised quotation for your approval. Urgent call-out charges are shown before you pay. A professional’s arrival time is an estimate and is not guaranteed until they accept your request.</p>
      <h2>5. Cancellations and refunds</h2>
      <p>The cancellation terms that apply to a booking are shown at checkout and on the booking page. In general: you may cancel before a professional accepts for a full refund; if a professional declines, cancels or does not arrive, you are refunded in full; if you cancel after acceptance, any fee shown at checkout for travel or work already done may be retained and the rest refunded. Refunds are returned to the original payment method and tracked on the booking.</p>
      <h2>6. Disputes</h2>
      <p>If the work is incomplete or not as agreed, use <strong>Raise an issue</strong> on the booking. Payment stays held while a dispute is open. Both sides can add messages and photos. Our team reviews the evidence and decides on a full refund, partial refund or release to the professional, and records the outcome on the booking. Raise issues promptly, while the evidence is fresh.</p>
      <h2>7. Reviews</h2>
      <p>Reviews must be honest and based on a completed booking. We remove reviews that are abusive, fake or unrelated to the job. Professionals can respond publicly to reviews.</p>
      <h2>8. Safety and conduct</h2>
      <p>Treat each other with respect. Do not move payment off the platform to avoid fees, share another person’s private information, or misuse live location. Live location is shared only during an accepted journey and stops when work starts. For danger to life or property call 999 or 112 first.</p>
      <h2>9. Liability</h2>
      <p>We work to verify identity and credentials and to handle disputes fairly, but we do not guarantee the quality of any professional’s work. Verification badges show only what is stated on them. Nothing in these terms excludes liability that cannot be excluded by law. Subject to that, FundiLink’s liability to you for a booking is limited to the amount you paid for it. We do not offer insurance-backed protection unless a specific cover is described on the booking.</p>
      <h2>10. Changes and contact</h2>
      <p>We may update these terms and will tell you about material changes. Continued use after a change means you accept it. Questions: <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>. These terms are governed by the laws of Kenya.</p>
    </Page>
  );
}
