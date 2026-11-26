'use client';
import { PageTitle } from '@/components/ui';
import { WalletView } from '@/components/WalletView';

export default function WalletPage() {
  return (<><PageTitle title="Wallet" sub="Prepaid balance for pay-on-site jobs." /><WalletView /></>);
}
