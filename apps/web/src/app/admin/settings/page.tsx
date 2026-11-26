'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Card, Check, PageTitle, TextArea, TextField } from '@/components/ui';

export default function Settings() {
  const t = useToast();
  const [c, setC] = useState({ pct: '5', fee: '', reason: '' });
  const [a, setA] = useState({ amount: '', enabled: false, founding: true, reason: '' });
  const guard = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); t.ok(ok); } catch (e: any) { t.err(e?.status === 403 ? 'Your role cannot change this setting' : errMsg(e)); } };
  return (
    <><PageTitle title="Commission & fees" sub="Financial settings are permission-gated and every change is audited with its reason." />
      <div className="grid g2">
        <Card><h3>Commission</h3>
          <TextField label="Professional commission (%)" inputMode="decimal" value={c.pct} onChange={(e) => setC({ ...c, pct: e.target.value })} />
          <TextField label="Customer service fee (%) optional" inputMode="decimal" value={c.fee} onChange={(e) => setC({ ...c, fee: e.target.value })} />
          <TextArea label="Reason for change" value={c.reason} onChange={(e) => setC({ ...c, reason: e.target.value })} />
          <Button disabled={!Number(c.pct) || c.reason.trim().length < 5} onClick={() => guard(() => api.admin.setCommission({ commissionBps: Math.round(Number(c.pct) * 100), customerFeeBps: c.fee ? Math.round(Number(c.fee) * 100) : undefined, reason: c.reason }), 'Commission updated')}>Update commission</Button>
          <p className="small muted">Applies to new bookings only. Existing bookings keep the rate they were created with.</p></Card>
        <Card><h3>Professional activation fee</h3>
          <TextField label="One-off fee (KSh)" inputMode="decimal" value={a.amount} onChange={(e) => setA({ ...a, amount: e.target.value })} />
          <Check label="Fee enabled" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} />
          <Check label="Waive for founding professionals" checked={a.founding} onChange={(e) => setA({ ...a, founding: e.target.checked })} />
          <TextArea label="Reason for change" value={a.reason} onChange={(e) => setA({ ...a, reason: e.target.value })} />
          <Button disabled={a.reason.trim().length < 5 || (a.enabled && !Number(a.amount))} onClick={() => guard(() => api.admin.setActivationFee({ amount: Math.round(Number(a.amount || 0) * 100), enabled: a.enabled, founding_waiver: a.founding, reason: a.reason }), 'Activation fee updated')}>Update activation fee</Button>
          <p className="small muted">The fee never affects ratings, verification or search ranking.</p></Card>
      </div></>
  );
}
