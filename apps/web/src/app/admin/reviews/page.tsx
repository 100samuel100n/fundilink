'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Select, Stars } from '@/components/ui';
import { ListPage } from '@/components/ListPage';
export default function Reviews() {
  const t = useToast(); const [status, setStatus] = useState('flagged');
  const act = async (id: string, to: 'published' | 'removed', reload: () => void) => { const reason = prompt(to === 'removed' ? 'Which policy does this review breach? (min 10 chars)' : 'Why is it restored? (min 10 chars)'); if (!reason) return; try { await api.adminX.moderateReview(id, { status: to, reason }); t.ok('Done'); reload(); } catch (e) { t.err(errMsg(e)); } };
  return <ListPage key={status} title="Review moderation" sub="Genuine negative reviews stay. Remove only fake, abusive or policy-breaching reviews, with a recorded reason." load={() => api.adminX.reviews(status)}
    header={() => <div style={{ maxWidth: 240 }}><Select label="Show" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'flagged', label: 'Flagged' }, { value: 'removed', label: 'Removed' }, { value: 'published', label: 'Published' }]} /></div>}
    cols={(reload) => [{ h: 'Professional', cell: (r) => r.professional }, { h: 'Customer', cell: (r) => r.customer }, { h: 'Rating', cell: (r) => <Stars value={r.overall} /> }, { h: 'Review', cell: (r) => r.body ?? '—' },
      { h: '', cell: (r) => r.status === 'removed' ? <Button small tone="secondary" onClick={() => act(r.id, 'published', reload)}>Restore</Button> : <Button small tone="danger" onClick={() => act(r.id, 'removed', reload)}>Remove</Button> }]} />;
}
