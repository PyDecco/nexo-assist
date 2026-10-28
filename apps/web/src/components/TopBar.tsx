import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function TopBar({ here, children }: { here: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        Service desk de TI <ChevronRight size={14} /> <b>{here}</b>
      </div>
      {children}
    </header>
  );
}
