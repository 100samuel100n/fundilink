'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { LocationCard } from '@/components/LocationCard';
import { Button, Card, PageTitle, Select, TextField } from '@/components/ui';

export default function Settings() {
  const t = useToast();
  const [f, setF] = useState({ kind: 'mobile_money' as 'mobile_money' | 'bank', provider: 'M-Pesa', accountRef: '', accountName: '' });
  return (
    <><PageTitle title="Settings" />
    <LocationCard />
      <Card><h3>Payout account</h3><p className="small muted">Changing this triggers a security alert to you. The account name must match your verified identity.</p>
        <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as any, provider: e.target.value === 'bank' ? '' : 'M-Pesa' })} options={[{ value: 'mobile_money', label: 'Mobile money' }, { value: 'bank', label: 'Bank' }]} />
        <TextField label={f.kind === 'bank' ? 'Bank name' : 'Provider'} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
        <TextField label={f.kind === 'bank' ? 'Account number' : 'Phone number'} value={f.accountRef} onChange={(e) => setF({ ...f, accountRef: e.target.value })} />
        <TextField label="Account name" value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} />
        <Button disabled={!f.provider || f.accountRef.length < 6 || f.accountName.length < 2} onClick={async () => { try { await api.setPayoutAccount(f); t.ok('Payout account saved'); } catch (e) { t.err(errMsg(e)); } }}>Save payout account</Button></Card></>
  );
}
