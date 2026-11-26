'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, PageTitle, TextArea } from '@/components/ui';

const TEMPLATES = ['booking_accepted', 'booking_declined', 'appointment_reminder', 'payment_received', 'refund_processed', 'payout_completed', 'verification_update', 'request_expired'];
export default function Templates() {
  const t = useToast(); const s = useAsync(() => api.adminX.settings());
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <><PageTitle title="Notification templates" sub="Edit the SMS / email / push wording. Placeholders: {{name}}, {{reference}}, {{amount}}." />
      <Async state={s}>{(rows) => <div className="grid g2">{TEMPLATES.map((k) => { const cur = rows.find((r) => r.key === `template.${k}`)?.value; const text = draft[k] ?? (typeof cur === 'string' ? cur : '');
        return <Card key={k}><h3>{k.replace(/_/g, ' ')}</h3><TextArea label="Message" rows={3} value={text} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          <Button small disabled={draft[k] === undefined} onClick={async () => { const reason = prompt('Reason for the change?'); if (!reason) return; try { await api.adminX.setSetting(`template.${k}`, draft[k], reason); t.ok('Saved'); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Save</Button></Card>; })}</div>}</Async></>
  );
}
