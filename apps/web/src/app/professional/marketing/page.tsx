'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAsync } from '@/lib/hooks';
import { Async, Button, Card, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Marketing() {
  const t = useToast(); const m = useAsync(() => api.marketing()); const inv = useAsync(() => api.proInvoices());
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); t.ok('Copied'); } catch { t.err('Copy failed'); } };
  return (
    <><PageTitle title="Grow & invoices" sub="Your public page is a business asset that search engines can index." />
      <Async state={m}>{(x) => <div className="grid g2"><Card><h3>Share your profile</h3><p style={{ wordBreak: 'break-all' }}>{x.shareUrl}</p><div className="row"><Button small onClick={() => copy(x.shareUrl)}>Copy link</Button><a className="btn secondary small" href={`https://wa.me/?text=${encodeURIComponent(`Book me on FundiLink: ${x.shareUrl}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a></div></Card>
        <Card><h3>Referral code</h3><p style={{ fontSize: '1.4rem', fontWeight: 800 }}>{x.referralCode}</p><p className="muted small">Rewards are issued only after the referred account completes its first real job.</p><Button small onClick={() => copy(x.referralCode)}>Copy</Button></Card></div>}</Async>
      <Card style={{ marginTop: 20 }}><h3>Invoices</h3><Async state={inv}>{(rows) => <DataTable rows={rows} empty="No invoices yet" cols={[{ h: 'No.', cell: (r) => r.number }, { h: 'Booking', cell: (r) => r.reference }, { h: 'Issued', cell: (r) => dt(r.issued_at) }, { h: 'Total', cell: (r) => kes(r.total) }, { h: 'Your earnings', cell: (r) => kes(r.professional_net) }]} />}</Async></Card></>
  );
}
