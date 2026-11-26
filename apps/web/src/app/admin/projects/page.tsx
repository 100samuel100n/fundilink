'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui';
import { dt } from '@/components/DataTable';
import { ListPage } from '@/components/ListPage';
export default function Projects() {
  return <ListPage title="Projects & milestones" load={() => api.adminX.projects()} cols={() => [{ h: 'Title', cell: (p) => p.title }, { h: 'Customer', cell: (p) => p.customer }, { h: 'Budget', cell: (p) => (p.budget ? kes(p.budget) : '—') }, { h: 'Milestones', cell: (p) => p.milestones }, { h: 'Status', cell: (p) => <Badge>{p.status}</Badge> }, { h: 'Created', cell: (p) => dt(p.created_at) }]} />;
}
