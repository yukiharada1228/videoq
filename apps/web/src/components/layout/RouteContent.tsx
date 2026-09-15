import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';

class RouteErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page rendering failed:', error, info);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/** Loading and rendering failures replace only the route's content, never its layout. */
export function RouteContent() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <RouteErrorBoundary
      key={location.pathname}
      fallback={<MessageAlert type="error" message={t('common.messages.pageLoadFailed')} />}
    >
      <Suspense fallback={<div className="flex justify-center py-24"><LoadingSpinner /></div>}>
        <Outlet />
      </Suspense>
    </RouteErrorBoundary>
  );
}
