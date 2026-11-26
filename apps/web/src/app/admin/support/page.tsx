'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, Select, TextArea } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Support() {
  const t = useToast(); const [status, setStatus] = useState('open'); const s = useAsync(() => api.adminX.tickets(status), [status]);
  const [open, setOpen] = useState<any>(null); const [body, setBody] = useState('');
  const load = async (id: string) => setOpen(await api.adminX.ticket(id));
  return (
    <><PageTitle title="Support desk" sub="AI hands sensitive cases here. Large refunds still need finance approval." />
      <div style={{ maxWidth: 240 }}><Select label="Queue" value={status} onChange={(e) => setStatus(e.target.value)} options={['open', 'pending_user', 'resolved', 'closed'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} /></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Async state={s}>{(rows) => <DataTable rows={rows} empty="Queue is clear" cols={[{ h: 'Ref', cell: (x) => <a href="#" onClick={(e) => { e.preventDefault(); load(x.id); }}>{x.reference}</a> }, { h: 'Subject', cell: (x) => x.subject }, { h: 'Who', cell: (x) => x.requester }, { h: 'Priority', cell: (x) => <Badge tone={x.priority === 'urgent' ? 'danger' : 'neutral'}>{x.priority}</Badge> }, { h: 'Updated', cell: (x) => dt(x.updated_at) }]} />}</Async>
        {open && <Card><h3>{open.subject}</h3><div className="stack" style={{ gap: 8, maxHeight: 320, overflow: 'auto' }}>{open.messages.map((m: any) => <div key={m.id} className="small" style={{ textAlign: m.staff ? 'right' : 'left' }}><Badge tone={m.staff ? 'success' : 'neutral'}>{m.staff ? 'Staff' : 'User'}</Badge> {m.body}</div>)}</div>
          <TextArea label="Reply" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="row"><Button disabled={!body} onClick={async () => { try { await api.adminX.replyTicket(open.id, { body, status: 'pending_user' }); setBody(''); t.ok('Sent'); load(open.id); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Send</Button>
            <Button tone="secondary" onClick={async () => { try { await api.adminX.replyTicket(open.id, { body: body || 'Marked resolved.', status: 'resolved' }); setBody(''); setOpen(null); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Resolve</Button></div></Card>}
      </div></>
  );
}
