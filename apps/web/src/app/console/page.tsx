import { redirect } from 'next/navigation';
import { ConsoleView } from '@/components/console/ConsoleView';
import { currentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function ConsolePage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'analyst') redirect('/atendimento');
  return <ConsoleView analyst={user} />;
}
