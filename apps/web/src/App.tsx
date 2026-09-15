import { lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { addLocalePrefix, getSavedLocale, useLocaleSync } from '@/lib/i18n';
import { defaultLocale, locales, type Locale } from '@/i18n/config';
import { withQueryAndHash } from '@/lib/seo';
import { AppRouteLayout, AuthRouteLayout, type AppPageRoute } from '@/components/layout/AppRouteLayout';
import { RouteContent } from '@/components/layout/RouteContent';

const HomePage = lazy(() => import('@/pages/HomePage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const SignupCheckEmailPage = lazy(() => import('@/pages/SignupCheckEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
const EmailChangeConfirmPage = lazy(() => import('@/pages/EmailChangeConfirmPage'));
const ConsentPage = lazy(() => import('@/pages/ConsentPage'));
const VideoLibraryPage = lazy(() => import('@/pages/VideoLibraryPage'));
const VideoDetailPage = lazy(() => import('@/pages/VideoDetailPage'));
const VideoCoursesPage = lazy(() => import('@/pages/VideoCoursesPage'));
const VideoCourseDetailPage = lazy(() => import('@/pages/VideoCourseDetailPage'));
const SharePage = lazy(() => import('@/pages/SharePage'));
const CourseInvitationPage = lazy(() => import('@/pages/CourseInvitationPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const PricingPage = lazy(() => import('@/pages/PricingPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));

function LocaleGate() {
  const params = useParams<{ locale?: string }>();
  const location = useLocation();
  const locale = params.locale;

  // Must be called unconditionally (rules-of-hooks)
  useLocaleSync();

  if (locale && !locales.includes(locale as Locale)) {
    return <Navigate to="/" replace />;
  }

  // Use the router-decoded locale to normalize only the matched prefix:
  // /ja/foo → /foo, /%65n/foo → /en/foo. Preserve the rest of the URL as encoded.
  if (locale) {
    const pathname = locale === defaultLocale
      ? location.pathname.replace(/^\/[^/]+(\/|$)/, '$1') || '/'
      : location.pathname.replace(/^\/[^/]+/, `/${locale}`);
    if (pathname !== location.pathname) {
      return <Navigate to={withQueryAndHash(pathname, location.search, location.hash)} replace />;
    }
  }

  // Returning visitors who explicitly chose English. Never use Accept-Language
  // here — Googlebot would be sent to /en/ and index English as the homepage.
  if (!locale) {
    const saved = getSavedLocale();
    if (saved && saved !== defaultLocale) {
      const nextPath = withQueryAndHash(
        addLocalePrefix(location.pathname, saved),
        location.search,
        location.hash,
      );
      return <Navigate to={nextPath} replace />;
    }
  }

  return <Outlet />;
}

const appPageRoutes: AppPageRoute[] = [
  { index: true, element: <HomePage />, handle: { activePage: 'home' } },
  { path: 'videos', element: <VideoLibraryPage />, handle: { activePage: 'videoLibrary' } },
  { path: 'videos/:id', element: <VideoDetailPage />, handle: { activePage: 'videoLibrary', variant: 'workspace' } },
  { path: 'videos/courses', element: <VideoCoursesPage />, handle: { activePage: 'courses' } },
  { path: 'videos/courses/:id', element: <VideoCourseDetailPage />, handle: { activePage: 'courses', variant: 'workspace' } },
  { path: 'settings', element: <SettingsPage />, handle: { activePage: 'settings' } },
  { path: 'pricing', element: <PricingPage />, handle: { activePage: 'pricing' } },
  { path: 'terms', element: <LegalPage page="terms" />, handle: {} },
  { path: 'privacy', element: <LegalPage page="privacy" />, handle: {} },
  { path: 'refund', element: <LegalPage page="refund" />, handle: {} },
  { path: 'legal', element: <LegalPage page="scta" />, handle: {} },
  { path: 'admin', element: <AdminPage />, handle: { activePage: 'admin' } },
];

const routeChildren = (
  <>
    <Route element={<AppRouteLayout routes={appPageRoutes} />}>
      {appPageRoutes.map((route) => <Route key={route.path ?? 'home'} {...route} />)}
    </Route>

    <Route element={<AuthRouteLayout />}>
      <Route path="login" element={<LoginPage />} />
      <Route path="signup" element={<SignupPage />} />
      <Route path="signup/check-email" element={<SignupCheckEmailPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="verify-email" element={<VerifyEmailPage />} />
      <Route path="change-email" element={<EmailChangeConfirmPage />} />
      <Route path="consent" element={<ConsentPage />} />
      <Route path="course-invitations/:token" element={<CourseInvitationPage />} />
    </Route>

    {/* Public shared courses have their own header and full-screen UI. */}
    <Route element={<RouteContent />}>
      <Route path="share/:token" element={<SharePage />} />
    </Route>
  </>
);

export default function App() {
  return (
    <Routes>
      {/* Default locale (no prefix) */}
      <Route path="/" element={<LocaleGate />}>
        {routeChildren}
      </Route>

      {/* Localized routes: /:locale/... */}
      <Route path=":locale" element={<LocaleGate />}>
        {routeChildren}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
