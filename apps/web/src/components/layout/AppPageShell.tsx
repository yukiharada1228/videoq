import type { ReactNode } from 'react';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppNav, type ActivePage } from '@/components/layout/AppNav';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

interface AppPageShellProps {
  activePage?: ActivePage;
  children: ReactNode;
  contentClassName?: string;
  isPublic?: boolean;
  variant?: 'standard' | 'workspace';
}

export function AppPageShell({
  activePage,
  children,
  contentClassName = APP_CONTAINER_CLASS,
  isPublic = false,
  variant = 'standard',
}: AppPageShellProps) {
  const mainClassName = variant === 'workspace'
    ? 'flex w-full flex-1 flex-col'
    : `mx-auto w-full flex-1 pb-16 pt-8 ${contentClassName}`;

  return (
    <div
      className={`flex min-h-screen flex-col text-solid-gray-800 ${variant === 'standard' ? 'bg-white' : 'bg-solid-gray-50'}`}
      style={{ scrollbarGutter: 'stable' }}
    >
      <AppNav activePage={activePage} isPublic={isPublic} />
      <main className={mainClassName}>
        {children}
      </main>
      {variant === 'standard' && <AppFooter />}
    </div>
  );
}
