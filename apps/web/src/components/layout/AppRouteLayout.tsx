import { matchPath } from 'react-router-dom';
import { useI18nLocation } from '@/lib/i18n';
import type { ActivePage } from '@/components/layout/AppNav';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { RouteContent } from '@/components/layout/RouteContent';

const ACTIVE_PAGES: Record<string, ActivePage> = {
  '/': 'home',
  '/videos': 'videoLibrary',
  '/videos/courses': 'courses',
  '/pricing': 'pricing',
  '/settings': 'settings',
  '/admin': 'admin',
};

export function AppRouteLayout() {
  const { pathname } = useI18nLocation();
  const path = pathname.replace(/\/$/, '') || '/';
  const isCourse = Boolean(matchPath('/videos/courses/:id', path));
  const isVideo = path !== '/videos/courses' && Boolean(matchPath('/videos/:id', path));
  const activePage = isCourse ? 'courses' : isVideo ? 'videoLibrary' : ACTIVE_PAGES[path];

  return (
    <AppPageShell activePage={activePage} variant={isCourse || isVideo ? 'workspace' : 'standard'}>
      <RouteContent />
    </AppPageShell>
  );
}

export function AuthRouteLayout() {
  return (
    <AuthLayout>
      <RouteContent />
    </AuthLayout>
  );
}
