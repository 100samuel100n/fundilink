'use client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, PageTitle, Skeleton, Stat } from '@/components/ui';

const BRAND = '#0FA192', INK = '#7A8CA3';
const Chart = ({ title, children, label }: { title: string; label: string; children: React.ReactElement }) => <Card><h3>{title}</h3><div style={{ height: 260 }} role="img" aria-label={label}><ResponsiveContainer>{children}</ResponsiveContainer></div></Card>;
export default function Analytics() {
  const a = useAsync(() => api.adminX.analytics());
  return (
    <><PageTitle title="Marketplace analytics" sub="Liquidity, conversion and retention matter more than sign-up counts." />
      <Async state={a} skeleton={<Skeleton h={140} n={3} />}>{(d) => {
        const rev = d.revenue.map((r: any) => ({ month: r.month.slice(0, 7), revenue: Number(r.revenue) / 100, bookings: r.bookings }));
        const su = d.signups.map((r: any) => ({ month: r.month.slice(0, 7), customers: r.customers, professionals: r.professionals }));
        return (
          <div className="stack" style={{ gap: 20 }}>
            <div className="grid g4">
              <Stat n={`${d.funnel.searchToBookingPct}%`} l="Search → booking (30d)" /><Stat n={`${d.retention.customer_repeat_pct ?? 0}%`} l="Customers who rebook" /><Stat n={`${d.retention.professional_active_30d_pct ?? 0}%`} l="Professionals active (30d)" /><Stat n={`${d.requestAcceptance.request_acceptance_pct ?? 0}%`} l="Request acceptance" />
            </div>
            <div className="grid g2">
              <Chart title="Revenue over time (KSh)" label="Monthly platform revenue"><LineChart data={rev}><CartesianGrid strokeDasharray="3 3" stroke="#8884" /><XAxis dataKey="month" stroke={INK} /><YAxis stroke={INK} /><Tooltip /><Line dataKey="revenue" stroke={BRAND} strokeWidth={2} dot={false} /></LineChart></Chart>
              <Chart title="Customers vs professionals (sign-ups)" label="New customers and professionals per month"><BarChart data={su}><XAxis dataKey="month" stroke={INK} /><YAxis stroke={INK} /><Tooltip /><Bar dataKey="customers" fill={BRAND} /><Bar dataKey="professionals" fill="#2B6CB0" /></BarChart></Chart>
              <Chart title="Most profitable categories (KSh)" label="Revenue by category"><BarChart layout="vertical" data={d.profitable.map((x: any) => ({ category: x.category, revenue: Number(x.revenue) / 100 }))} margin={{ left: 80 }}><XAxis type="number" stroke={INK} /><YAxis type="category" dataKey="category" stroke={INK} width={110} /><Tooltip /><Bar dataKey="revenue" fill={BRAND} /></BarChart></Chart>
              <Chart title="Cancellation trend (% of bookings)" label="Weekly cancellation rate"><LineChart data={d.cancel.map((x: any) => ({ week: x.week.slice(5, 10), pct: Number(x.cancel_pct) }))}><CartesianGrid strokeDasharray="3 3" stroke="#8884" /><XAxis dataKey="week" stroke={INK} /><YAxis stroke={INK} /><Tooltip /><Line dataKey="pct" stroke="#C53030" strokeWidth={2} dot={false} /></LineChart></Chart>
              <Chart title="Supply by county (geographic liquidity)" label="Active professionals per county"><BarChart data={d.liquidity}><XAxis dataKey="county" stroke={INK} /><YAxis stroke={INK} /><Tooltip /><Bar dataKey="active_professionals" fill="#2F855A" /></BarChart></Chart>
            </div>
          </div>);
      }}</Async></>
  );
}
