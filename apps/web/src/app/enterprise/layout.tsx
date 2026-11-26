'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Guard, Shell } from '@/components/Guard';
import { OrgProvider } from '@/components/Org';
import { Button, Card, Select, TextField } from '@/components/ui';

const LINKS = [{ href: '/enterprise', label: 'Overview & spend' }, { href: '/enterprise/properties', label: 'Properties' }, { href: '/enterprise/requests', label: 'Maintenance requests' }, { href: '/enterprise/contracts', label: 'Recurring contracts' }, { href: '/enterprise/team', label: 'Team & permissions' }, { href: '/enterprise/statements', label: 'Invoices & history' }];

function CreateOrg() {
  const t = useToast();
  const [f, setF] = useState({ name: '', kind: 'property_manager', billingEmail: '', registrationNo: '' });
  return (
    <Card style={{ maxWidth: 520 }}><h2>Create your business account</h2><p className="muted small">Manage many properties, approve spend, schedule recurring maintenance and track history.</p>
      <TextField label="Organisation name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={['property_manager', 'landlord', 'hotel', 'school', 'hospital', 'construction', 'office', 'other'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))} />
      <TextField label="Billing email" type="email" value={f.billingEmail} onChange={(e) => setF({ ...f, billingEmail: e.target.value })} />
      <TextField label="Registration number (optional)" value={f.registrationNo} onChange={(e) => setF({ ...f, registrationNo: e.target.value })} />
      <Button disabled={f.name.length < 2} onClick={async () => { try { await api.createOrg({ name: f.name, kind: f.kind, billingEmail: f.billingEmail || undefined, registrationNo: f.registrationNo || undefined }); t.ok('Created'); location.reload(); } catch (e) { t.err(errMsg(e)); } }}>Create</Button></Card>
  );
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Guard need="any"><Shell links={LINKS}><OrgProvider fallback={<CreateOrg />}>{children}</OrgProvider></Shell></Guard>;
}
