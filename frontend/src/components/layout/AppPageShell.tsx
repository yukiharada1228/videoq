import type { ReactNode } from 'react';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppNav, type ActivePage } from '@/components/layout/AppNav';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

interface AppPageShellProps {
  activePage: ActivePage;
  children: ReactNode;
  contentClassName?: string;
}

export function AppPageShell({
  activePage,
  children,
  contentClassName = APP_CONTAINER_CLASS,
}: AppPageShellProps) {
  return (
    <div
      className="min-h-screen bg-[#f8faf5] text-[#191c19] flex flex-col"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", scrollbarGutter: 'stable' }}
    >
      <AppNav activePage={activePage} />
      <main className={`flex-1 pt-24 pb-12 mx-auto w-full ${contentClassName}`}>
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
