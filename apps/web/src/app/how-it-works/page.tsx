import Link from 'next/link';
import { Page } from '@/components/Page';
export const metadata = { title: 'How it works' };
export default function P() {
  return <Page title="How FundiLink works" lead="From search to settled payment, every step is tracked.">
    <h2>For customers</h2>
    <ol><li><strong>Find:</strong> search by trade, describe the problem in your own words, or use your exact location.</li><li><strong>Compare:</strong> prices, ratings, experience, verification and availability.</li><li><strong>Book:</strong> instant, scheduled, emergency, or request quotations for bigger projects.</li><li><strong>Pay securely:</strong> see the full price breakdown first. Pay with M-Pesa, card or bank.</li><li><strong>Track:</strong> watch your professional travel to you on a live map once they accept and set off.</li><li><strong>Confirm and review:</strong> the professional is paid after you confirm the work.</li></ol>
    <h2>Price changes</h2><p>If a professional finds extra work, they must send a revised quotation. Nothing is added to your price unless you approve it.</p>
    <p><Link className="btn" href="/explore">Find a professional</Link></p>
  </Page>;
}
