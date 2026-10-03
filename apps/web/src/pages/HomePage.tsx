import { lazy, Suspense } from 'react';
import { useAuthSession } from '@/lib/authSession';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import LandingPage from '@/pages/LandingPage';

const HomeDashboard = lazy(() => import('@/pages/HomeDashboard'));

export default function HomePage() {
  const session = useAuthSession();

  // Public content is ready immediately, including while the cookie session is checked.
  if (!session.data?.user) {
    return <LandingPage />;
  }

  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <HomeDashboard />
    </Suspense>
  );
}
