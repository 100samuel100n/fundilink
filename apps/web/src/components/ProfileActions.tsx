'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Button, TextArea } from './ui';
import { useCompare } from './Compare';

export function ProfileActions({ id, slug, name, categoryHint }: { id: string; slug: string; name: string; categoryHint?: string }) {
  const { session } = useAuth();
  const t = useToast();
  const { toggle } = useCompare();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const need = () => { if (!session) { t.err('Please sign in first'); return false; } return true; };
  const share = async () => {
    const url = `${location.origin}/professionals/${slug}`;
    try { if (navigator.share) await navigator.share({ title: name, url }); else { await navigator.clipboard.writeText(url); t.ok('Link copied'); } } catch { /* cancelled */ }
  };
  return (
    <div className="stack">
      <Link className="btn block" href={`/app/book/${slug}`}>Book now</Link>
      <Link className="btn secondary block" href={`/app/quotations/new${categoryHint ? `?category=${categoryHint}` : ''}`}>Request quotation</Link>
      <Button tone="ghost" block onClick={async () => { if (!need()) return; try { const r = await api.get<any[]>('/bookings?as=customer'); const b = r.find((x) => x.professional_id === id); if (!b) return t.err('You can message a professional after you send a booking request.'); const c = await api.openConversation(b.id); location.href = `/app/messages?c=${c.id}`; } catch (e: any) { t.err(e.message); } }}>Message</Button>
      <div className="row"><Button tone="ghost" small onClick={async () => { if (!need()) return; try { await api.savePro(id); t.ok('Saved'); } catch (e: any) { t.err(e.message); } }}>Save</Button><Button tone="ghost" small onClick={share}>Share</Button><Button tone="ghost" small onClick={() => toggle({ id, name })}>Compare</Button></div>
      <button className="small muted" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }} onClick={() => setReporting(!reporting)}>Report this profile</button>
      {reporting ? (
        <div><TextArea label="What is wrong?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button small disabled={reason.trim().length < 5} onClick={async () => { if (!need()) return; try { await api.report({ targetKind: 'professional', targetId: id, reason: reason.trim() }); t.ok('Thanks. Our team will review it.'); setReporting(false); setReason(''); } catch (e: any) { t.err(e.message); } }}>Send report</Button></div>
      ) : null}
    </div>
  );
}
