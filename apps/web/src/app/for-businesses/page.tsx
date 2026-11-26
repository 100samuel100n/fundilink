import Link from 'next/link';
import { Page } from '@/components/Page';
export const metadata = { title: 'For businesses', description: 'Property managers, hotels, offices and institutions: manage maintenance across properties.' };
export default function P() {
  return <Page title="Maintenance for organisations" lead="Landlords, property managers, hotels, schools, hospitals and construction firms: one place to source, approve and track professional services.">
    <ul><li>Register many properties, buildings and units.</li><li>Route maintenance requests through approvals and spending limits.</li><li>Compare quotations and schedule recurring contracts (weekly cleaning, monthly pest control, quarterly inspections).</li><li>Team members with different permissions; invoices and statements you can download.</li><li>A complete maintenance history per property.</li></ul>
    <p><Link className="btn" href="/enterprise">Open the business portal</Link></p>
  </Page>;
}
