import Link from 'next/link';
import { Page } from '@/components/Page';
import { Card } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Contact' };
export default function P() {
  return (
    <Page title="Contact us" lead="The fastest help for a booking problem is from the booking itself. For anything else, reach us here.">
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card><span className="ico"><Icon name="message" size={20} /></span><h3 style={{ marginTop: 12 }}>Email</h3><p><a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a></p><p className="muted small" style={{ margin: 0 }}>{SITE.hours}</p></Card>
        {SITE.supportPhone ? <Card><span className="ico"><Icon name="phone" size={20} /></span><h3 style={{ marginTop: 12 }}>Phone</h3><p><a href={`tel:${SITE.supportPhone.replace(/\s+/g, '')}`}>{SITE.supportPhone}</a></p><p className="muted small" style={{ margin: 0 }}>{SITE.hours}</p></Card> : null}
        {SITE.whatsapp ? <Card><span className="ico"><Icon name="message" size={20} /></span><h3 style={{ marginTop: 12 }}>WhatsApp</h3><p><a href={`https://wa.me/${SITE.whatsapp.replace(/\D/g, '')}`}>{SITE.whatsapp}</a></p></Card> : null}
        <Card><span className="ico"><Icon name="flag" size={20} /></span><h3 style={{ marginTop: 12 }}>Problem with a booking?</h3><p className="small">Open the booking and use <strong>Help</strong> or <strong>Raise an issue</strong>. It links your case to the job, the payment and the messages.</p><Link className="btn sm" href="/app/bookings">My bookings</Link></Card>
      </div>
      <p className="muted small" style={{ marginTop: 20 }}>In danger? Call <strong>999</strong> or <strong>112</strong> first. FundiLink is not an emergency service. {SITE.address ? <>Registered office: {SITE.address}.</> : null}</p>
    </Page>
  );
}
