import type { ReactNode } from 'react';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppNav, type ActivePage } from '@/components/layout/AppNav';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

interface AppPageShellProps {
  activePage?: ActivePage;
  children: ReactNode;
  contentClassName?: string;
  isPublic?: boolean;
}

export function AppPageShell({
  activePage,
  children,
  contentClassName = APP_CONTAINER_CLASS,
  isPublic = false,
}: AppPageShellProps) {
  return (
    <div
      className="flex min-h-screen flex-col bg-white text-solid-gray-800"
      style={{ scrollbarGutter: 'stable' }}
    >
      <AppNav activePage={activePage} isPublic={isPublic} />
      <main className={`mx-auto w-full flex-1 pb-16 pt-8 ${contentClassName}`}>
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
