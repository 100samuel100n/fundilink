'use client';
import { api } from '@/lib/api';
import { timeAgo } from '@fundilink/sdk';
import { useAsync } from '@/lib/hooks';
import { Async, Card, Empty, PageTitle } from '@/components/ui';

export default function Notifications() {
  const n = useAsync(() => api.notifications());
  return <><PageTitle title="Notifications" /><Async state={n}>{(l) => !l.length ? <Empty title="You are all caught up" /> : <div className="stack">{l.map((x) => <Card key={x.id} className="flat" style={{ opacity: x.read_at ? 0.65 : 1 }}><div className="row between"><strong>{x.title}</strong><span className="muted small">{timeAgo(x.created_at)}</span></div><p className="muted small" style={{ margin: '4px 0 0' }}>{x.body}</p>{!x.read_at ? <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={async () => { await api.markRead(x.id); n.refresh(); }}>Mark read</button> : null}</Card>)}</div>}</Async></>;
}
