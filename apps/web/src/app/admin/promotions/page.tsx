'use client';
import { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Badge, Button, Card, Select, TextField } from '@/components/ui';
import { dt } from '@/components/DataTable';
import { ListPage } from '@/components/ListPage';
export default function Promotions() {
  const t = useToast(); const [f, setF] = useState({ code: '', kind: 'percent', value: '', max: '' });
  return <ListPage title="Promotions & coupons" sub="Discounts are funded from the platform's margin only; a coupon can never reduce a professional's payout. Codes starting PUB- are shown publicly." load={() => api.adminX.promotions()}
    header={(reload) => <Card style={{ maxWidth: 680, marginBottom: 16 }}><h3>New campaign</h3><div className="row wrap-r">
      <TextField label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
      <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed KSh' }, { value: 'credit', label: 'Credit KSh' }]} />
      <TextField label={f.kind === 'percent' ? 'Percent (e.g. 10)' : 'Amount (KSh)'} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
      <TextField label="Max redemptions" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></div>
      <Button disabled={f.code.length < 3 || !Number(f.value)} onClick={async () => { try { await api.adminX.addPromotion({ code: f.code, kind: f.kind, value: Math.round(Number(f.value) * 100), maxRedemptions: f.max ? Number(f.max) : undefined }); t.ok('Created'); setF({ code: '', kind: 'percent', value: '', max: '' }); reload(); } catch (e) { t.err(errMsg(e)); } }}>Create</Button></Card>}
    cols={(reload) => [{ h: 'Code', cell: (c) => c.code }, { h: 'Value', cell: (c) => (c.kind === 'percent' ? `${Number(c.value) / 100}%` : kes(c.value)) }, { h: 'Redeemed', cell: (c) => `${c.redemptions}${c.max_redemptions ? ` / ${c.max_redemptions}` : ''}` }, { h: 'Ends', cell: (c) => dt(c.ends_at) },
      { h: 'Status', cell: (c) => <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Active' : 'Off'}</Badge> }, { h: '', cell: (c) => <Button small tone="secondary" onClick={async () => { await api.adminX.togglePromotion(c.id); reload(); }}>{c.active ? 'Disable' : 'Enable'}</Button> }]} />;
}
