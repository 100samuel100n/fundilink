'use client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, PageTitle, Skeleton, Stat } from '@/components/ui';

const BRAND = '#0FA192', INK = '#7A8CA3';
export default function Overview() {
  const o = useAsync(() => api.admin.overview());
  return (
    <><PageTitle title="Platform overview" />
      <Async state={o} skeleton={<Skeleton h={100} n={3} />}>{(d) => {
        const series = d.series.map((s) => ({ day: s.day.slice(5, 10), bookings: Number(s.bookings), gmv: Number(s.gmv) / 100 }));
        return (
          <div className="stack" style={{ gap: 20 }}>
            <div className="grid g4">
              <Stat n={d.customers} l="Customers" /><Stat n={d.professionals} l="Professionals" /><Stat n={d.verified_professionals} l="Verified" /><Stat n={d.pending_verifications} l="Pending verification" />
              <Stat n={d.active_professionals} l="Active professionals" /><Stat n={d.active_counties} l="Active counties" /><Stat n={d.bookings.total} l="Bookings" /><Stat n={d.bookings.completed} l="Completed" />
              <Stat n={d.bookings.cancelled} l="Cancelled" /><Stat n={d.bookings.disputed} l="Disputed" /><Stat n={kes(d.bookings.gmv)} l="Gross booking value" /><Stat n={`${d.takeRatePct}%`} l="Take rate" />
              <Stat n={kes(d.finance.commission_revenue)} l="Commission revenue" /><Stat n={kes(d.finance.activation_revenue)} l="Activation revenue" /><Stat n={kes(d.finance.refunds)} l="Refunds" /><Stat n={kes(d.finance.pending_settlements)} l="Pending settlements" />
            </div>
            <div className="grid g2">
              <Card><h3>Bookings over time</h3><div style={{ height: 260 }} role="img" aria-label="Bookings per day line chart"><ResponsiveContainer><LineChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="#8884" /><XAxis dataKey="day" stroke={INK} /><YAxis allowDecimals={false} stroke={INK} /><Tooltip /><Line type="monotone" dataKey="bookings" stroke={BRAND} strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div></Card>
              <Card><h3>Gross booking value (KSh)</h3><div style={{ height: 260 }} role="img" aria-label="Gross booking value per day"><ResponsiveContainer><LineChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="#8884" /><XAxis dataKey="day" stroke={INK} /><YAxis stroke={INK} /><Tooltip /><Line type="monotone" dataKey="gmv" stroke="#2E6BFF" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div></Card>
              <Card><h3>Most popular services</h3><div style={{ height: 260 }} role="img" aria-label="Most popular services bar chart"><ResponsiveContainer><BarChart data={d.topServices.map((s) => ({ ...s, bookings: Number(s.bookings) }))} layout="vertical" margin={{ left: 60 }}><XAxis type="number" allowDecimals={false} stroke={INK} /><YAxis type="category" dataKey="service" stroke={INK} width={110} /><Tooltip /><Bar dataKey="bookings" fill={BRAND} radius={6} /></BarChart></ResponsiveContainer></div></Card>
              <Card><h3>Professionals by county</h3><div style={{ height: 260 }} role="img" aria-label="Professionals per county bar chart"><ResponsiveContainer><BarChart data={d.counties.map((s) => ({ ...s, professionals: Number(s.professionals) }))}><XAxis dataKey="county" stroke={INK} /><YAxis allowDecimals={false} stroke={INK} /><Tooltip /><Bar dataKey="professionals" fill="#12B76A" radius={6} /></BarChart></ResponsiveContainer></div></Card>
            </div>
          </div>);
      }}</Async></>
  );
}
