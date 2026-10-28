'use client';

import { LogOut, MessageSquare, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export async function logout(router: ReturnType<typeof useRouter>) {
  await fetch('/api/auth/logout', { method: 'POST' });
  router.replace('/login');
  router.refresh();
}

export function SidebarNav({ logoutOnly = false }: { logoutOnly?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  if (logoutOnly) {
    return (
      <button className="btn btn-ghost logout" onClick={() => logout(router)}>
        <LogOut size={16} color="var(--ink-3)" /> Sair
      </button>
    );
  }
  return (
    <nav className="nav">
      <Link href="/atendimento" className={path.startsWith('/atendimento') ? 'active' : ''}>
        <MessageSquare size={16} /> Atendimento
      </Link>
      <Link href="/perfil" className={path.startsWith('/perfil') ? 'active' : ''}>
        <UserRound size={16} /> Meu perfil
      </Link>
    </nav>
  );
}
