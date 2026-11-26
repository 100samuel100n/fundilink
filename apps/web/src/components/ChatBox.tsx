'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { Message } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Skeleton } from './ui';

function uid(jwt?: string) { try { return JSON.parse(atob(jwt!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub as string; } catch { return ''; } }

export function ChatBox({ bookingId, conversationId }: { bookingId?: string; conversationId?: string }) {
  const { session } = useAuth();
  const t = useToast();
  const me = uid(session?.accessToken);
  const [cid, setCid] = useState(conversationId ?? '');
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const live = useRef<Awaited<ReturnType<typeof api.chat>> | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const lastType = useRef(0);

  useEffect(() => { if (cid || !bookingId) return; api.openConversation(bookingId).then((c) => setCid(c.id)).catch((e) => t.err(errMsg(e))); }, [bookingId, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cid) return;
    let dead = false; let tm: any;
    api.messages(cid).then((m) => !dead && setMsgs(m)).catch((e) => { setMsgs([]); t.err(errMsg(e)); });
    api.chat(cid, {
      onMessage: (m) => setMsgs((l) => (l && !l.some((x) => x.id === m.id) ? [...l, m] : l ?? [m])),
      onTyping: () => { setTyping(true); clearTimeout(tm); tm = setTimeout(() => setTyping(false), 2500); },
      onRead: () => {},
    }).then((c) => { if (dead) c.close(); else { live.current = c; c.read(); } }).catch(() => { /* fall back to polling below */ });
    const poll = setInterval(() => api.messages(cid).then((m) => !dead && setMsgs(m)).catch(() => {}), 20000);
    return () => { dead = true; clearInterval(poll); live.current?.close(); live.current = null; };
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim(); if (!body) return;
    setText('');
    try {
      if (live.current) live.current.send(body);
      else { const m = await api.sendMessage(cid, body); setMsgs((l) => [...(l ?? []), m]); }
    } catch (x) { t.err(errMsg(x)); setText(body); }
  };
  if (!cid || !msgs) return <Skeleton h={160} />;
  return (
    <div>
      <div className="chat" role="log" aria-live="polite" aria-label="Conversation">
        {msgs.length === 0 ? <p className="muted small">No messages yet. Say hello.</p> : null}
        {msgs.map((m) => <div key={m.id} className={`bubble${m.sender_id === me ? ' me' : ''}`}>{m.body}<div className="small" style={{ opacity: .7 }}>{new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</div></div>)}
        {typing ? <div className="muted small">typing…</div> : null}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={send} style={{ marginTop: 8 }}>
        <input aria-label="Message" placeholder="Write a message" value={text} onChange={(e) => { setText(e.target.value); if (Date.now() - lastType.current > 1500) { lastType.current = Date.now(); live.current?.typing(); } }} />
        <Button type="submit" disabled={!text.trim()}>Send</Button>
      </form>
      <p className="small muted" style={{ marginBottom: 0 }}>Conversations are kept for dispute resolution. <button className="small" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', textDecoration: 'underline' }} onClick={async () => { if (confirm('Block this conversation?')) { try { await api.blockConversation(cid); t.ok('Blocked'); } catch (e) { t.err(errMsg(e)); } } }}>Block</button></p>
    </div>
  );
}
