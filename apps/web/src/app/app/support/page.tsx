'use client';
import { SITE } from '@/lib/site';
import React, { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { Button, Card, PageTitle } from '@/components/ui';

type M = { who: 'me' | 'bot'; text: string };
export default function Support() {
  const [msgs, setMsgs] = useState<M[]>([{ who: 'bot', text: 'Hi! I can help with bookings, refunds, cancellations and tracking. For payment problems or safety issues I will hand you to a person.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); const m = text.trim(); if (m.length < 2) return;
    setMsgs((l) => [...l, { who: 'me', text: m }]); setText(''); setBusy(true);
    try { const r = await api.support(m); setMsgs((l) => [...l, { who: 'bot', text: r.reply }]); if (r.escalated) setEscalated(true); } catch (x) { setMsgs((l) => [...l, { who: 'bot', text: errMsg(x) }]); }
    setBusy(false); setTimeout(() => end.current?.scrollIntoView(), 50);
  };
  return (
    <><PageTitle title="Support" sub="AI assistant first; people for anything sensitive." />
      <Card>
        <div className="chat" role="log" aria-live="polite">{msgs.map((m, i) => <div key={i} className={`bubble${m.who === 'me' ? ' me' : ''}`}>{m.text}</div>)}{busy ? <div className="muted small">Thinking…</div> : null}<div ref={end} /></div>
        {escalated ? <p className="banner">A support agent will pick this up. You can also email {SITE.supportEmail}.</p> : null}
        <form className="row" onSubmit={send}><input aria-label="Your question" placeholder="e.g. How do I cancel my booking?" value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit" loading={busy}>Send</Button></form>
      </Card></>
  );
}
