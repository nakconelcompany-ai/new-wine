import type { Metadata } from 'next';
import { isAdmin } from '@/lib/auth';
import AdminLogin from '@/components/AdminLogin';
import ResetVotes from '@/components/ResetVotes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reset Votes — New Wine Choir Awards', robots: { index: false, follow: false } };

export default async function ResetPage() {
  return (await isAdmin()) ? <ResetVotes /> : <main className="adm-wrap"><AdminLogin /></main>;
}
