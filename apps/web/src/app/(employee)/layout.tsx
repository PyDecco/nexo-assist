import { initials } from '@nexo/core';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { NexoMark } from '@/components/NexoMark';
import { SidebarNav } from '@/components/SidebarNav';
import { currentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'employee') redirect('/console');
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <NexoMark /> Nexo Assist
        </div>
        <SidebarNav />
        <div className="user">
          <div className="avatar">{initials(user.name)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="name">{user.name}</div>
            <div className="email">{user.email}</div>
          </div>
        </div>
        <SidebarNav logoutOnly />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
