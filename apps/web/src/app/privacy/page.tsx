import { Page } from '@/components/Page';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Privacy policy' };
export default function P() {
  return (
    <Page title="Privacy policy" lead={`How ${SITE.company} (FundiLink) collects and uses personal data under the Kenya Data Protection Act, 2019. Last updated 11 November 2026.`}>
      <h2>Who is responsible</h2>
      <p>{SITE.company} is the data controller for FundiLink.{SITE.odpcRegistration ? <> Registered with the Office of the Data Protection Commissioner (ODPC), registration number {SITE.odpcRegistration}.</> : null} Contact for privacy requests: <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, phone number, email, role.</li>
        <li>Booking details: addresses, descriptions, photos, messages, payment references.</li>
        <li>Location: your approximate or exact location when you allow it, for search and arrival tracking. A professional’s live location is collected only during an accepted journey.</li>
        <li>Verification material from professionals: identity documents, qualifications, business registration.</li>
        <li>Device and usage data needed to keep the service secure and working.</li>
      </ul>
      <h2>Why we use it</h2>
      <p>To run bookings and payments, verify professionals, show relevant results, enable arrival tracking, prevent fraud, resolve disputes, give support, and meet legal obligations. We do not sell personal data.</p>
      <h2>Who sees it</h2>
      <p>Customers and professionals see what is needed for a booking, such as the address and messages. Live location is visible only to the customer on that booking during the journey. We share data with service providers who process it for us (payments, messaging, maps, hosting) under contract, and with authorities when the law requires it.</p>
      <h2>How long we keep it</h2>
      <p>We keep data only as long as needed for the purposes above and to meet tax, accounting and legal requirements. Live location trails are deleted when a booking ends or after the minimum period needed to resolve a dispute. Identity documents are kept while a professional’s account is active and deleted afterwards unless the law requires longer. You can ask us for the retention period that applies to a specific kind of data.</p>
      <h2>Your rights</h2>
      <p>You can ask to access, correct or delete your data, object to or restrict certain uses, and receive a copy. Email us and we will respond within the time set by the Act. You can also complain to the Office of the Data Protection Commissioner.</p>
      <h2>Security and breaches</h2>
      <p>We use encryption in transit, access controls and audit logs. If a breach is likely to put people at risk, we notify the ODPC within 72 hours of becoming aware where the Act requires, and we tell affected people without undue delay with the steps they should take.</p>
      <h2>Children</h2>
      <p>FundiLink is for people aged 18 and over.</p>
    </Page>
  );
}
