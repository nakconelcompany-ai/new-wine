import type { Metadata } from 'next';
import { isAdmin } from '@/lib/auth';
import AdminLogin from '@/components/AdminLogin';
import AdminDashboard from '@/components/AdminDashboard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin — New Wine Choir Awards', robots: { index: false, follow: false } };

export default async function AdminPage() {
  return <main className="adm-wrap">{(await isAdmin()) ? <AdminDashboard /> : <AdminLogin />}</main>;
}
