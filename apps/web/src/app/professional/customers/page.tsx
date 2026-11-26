'use client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Empty, Money, PageTitle } from '@/components/ui';

export default function Customers() {
  const q = useAsync(() => api.myCustomers());
  return (
    <><PageTitle title="Customers" sub="People you have worked with. Contact details are only shared on active bookings." />
      <Async state={q}>{(l) => !l.length ? <Empty title="No customers yet" /> : (
        <div className="tablewrap"><table><thead><tr><th>Customer</th><th>Jobs</th><th>Earned</th><th>Last job</th></tr></thead>
          <tbody>{l.map((c) => <tr key={c.id}><td>{c.first_name}</td><td>{Number(c.jobs)}</td><td><Money minor={c.earned} /></td><td>{new Date(c.last_job).toLocaleDateString('en-KE')}</td></tr>)}</tbody></table></div>)}</Async></>
  );
}
