'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, Empty, PageTitle, Stars } from '@/components/ui';

export default function Saved() {
  const s = useAsync(() => api.savedPros());
  return <><PageTitle title="Saved professionals" /><Async state={s}>{(l) => !l.length ? <Empty title="Nothing saved yet" body="Tap on a professional to keep them here." action={<Link className="btn" href="/explore">Browse</Link>} /> : (
    <div className="grid g2">{l.map((p) => <Card key={p.id}><h3><Link href={`/professionals/${p.slug}`}>{p.display_name}</Link></h3><Stars value={Number(p.rating_avg)} /><div className="row" style={{ marginTop: 8 }}><Link className="btn sm" href={`/app/book/${p.slug}`}>Book again</Link></div></Card>)}</div>)}</Async></>;
}
