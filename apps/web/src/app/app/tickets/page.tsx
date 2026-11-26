'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, TextArea, TextField } from '@/components/ui';
import { dt } from '@/components/DataTable';

export default function Tickets() {
  const t = useToast(); const s = useAsync(() => api.tickets()); const [f, setF] = useState({ subject: '', body: '' }); const [open, setOpen] = useState<any>(null); const [reply, setReply] = useState('');
  return (
    <><PageTitle title="Support tickets" sub="For disputes, payment problems and anything the assistant could not settle." />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card><h3>New ticket</h3><TextField label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /><TextArea label="Describe the issue" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <Button disabled={f.subject.length < 3 || f.body.length < 5} onClick={async () => { try { await api.createTicket(f); t.ok('Ticket created'); setF({ subject: '', body: '' }); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Send</Button></Card>
        <div className="stack"><Async state={s}>{(rows) => rows.map((x) => <Card key={x.id}><div className="row between"><a href="#" onClick={async (e) => { e.preventDefault(); setOpen(await api.ticket(x.id)); }}><b>{x.reference}</b> {x.subject}</a><Badge>{x.status}</Badge></div><p className="muted small">{dt(x.updated_at)}</p></Card>)}</Async>
          {open && <Card><h3>{open.subject}</h3>{open.messages.map((m: any) => <p key={m.id} className="small" style={{ textAlign: m.staff ? 'left' : 'right' }}><Badge tone={m.staff ? 'success' : 'neutral'}>{m.staff ? 'Support' : 'You'}</Badge> {m.body}</p>)}
            <TextArea label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} /><Button small disabled={!reply} onClick={async () => { await api.replyTicket(open.id, reply); setReply(''); setOpen(await api.ticket(open.id)); }}>Send reply</Button></Card>}</div></div></>
  );
}
