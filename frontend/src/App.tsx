import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { addLocalePrefix, getSavedLocale, useLocaleSync } from '@/lib/i18n';
import { defaultLocale, locales, type Locale } from '@/i18n/config';
import { withQueryAndHash } from '@/lib/seo';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const HomePage = lazy(() => import('@/pages/HomePage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const SignupCheckEmailPage = lazy(() => import('@/pages/SignupCheckEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
const EmailChangeConfirmPage = lazy(() => import('@/pages/EmailChangeConfirmPage'));
const ConsentPage = lazy(() => import('@/pages/ConsentPage'));
const DevicePage = lazy(() => import('@/pages/DevicePage'));
const VideosPage = lazy(() => import('@/pages/VideosPage'));
const VideoDetailPage = lazy(() => import('@/pages/VideoDetailPage'));
const VideoGroupsPage = lazy(() => import('@/pages/VideoGroupsPage'));
const VideoGroupDetailPage = lazy(() => import('@/pages/VideoGroupDetailPage'));
const SharePage = lazy(() => import('@/pages/SharePage'));
const GroupInvitationPage = lazy(() => import('@/pages/GroupInvitationPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const PricingPage = lazy(() => import('@/pages/PricingPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const DeveloperDocsPage = lazy(() => import('@/pages/DeveloperDocsPage'));
const DeveloperDocsSectionPage = lazy(() => import('@/pages/DeveloperDocsSectionPage'));

function LocaleGate() {
  const params = useParams<{ locale?: string }>();
  const location = useLocation();
  const locale = params.locale;

  // Must be called unconditionally (rules-of-hooks)
  useLocaleSync();

  if (locale && !locales.includes(locale as Locale)) {
    return <Navigate to="/" replace />;
  }

  // Strip redundant default-locale prefix (/ja/foo → /foo).
  if (locale === defaultLocale) {
    const withoutLocale = location.pathname.replace(/^\/[^/]+(\/|$)/, '$1') || '/';
    return <Navigate to={withQueryAndHash(withoutLocale, location.search, location.hash)} replace />;
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

const routeChildren = (
  <>
    <Route index element={<HomePage />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="signup" element={<SignupPage />} />
    <Route path="signup/check-email" element={<SignupCheckEmailPage />} />
    <Route path="forgot-password" element={<ForgotPasswordPage />} />
    <Route path="reset-password" element={<ResetPasswordPage />} />
    <Route path="verify-email" element={<VerifyEmailPage />} />
    <Route path="change-email" element={<EmailChangeConfirmPage />} />
    <Route path="consent" element={<ConsentPage />} />
    <Route path="device" element={<DevicePage />} />
    <Route path="videos" element={<VideosPage />} />
    <Route path="videos/:id" element={<VideoDetailPage />} />
    <Route path="videos/groups" element={<VideoGroupsPage />} />
    <Route path="videos/groups/:id" element={<VideoGroupDetailPage />} />
    <Route path="share/:token" element={<SharePage />} />
    <Route path="group-invitations/:token" element={<GroupInvitationPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="pricing" element={<PricingPage />} />
    <Route path="terms" element={<LegalPage page="terms" />} />
    <Route path="privacy" element={<LegalPage page="privacy" />} />
    <Route path="refund" element={<LegalPage page="refund" />} />
    <Route path="legal" element={<LegalPage page="scta" />} />
    <Route path="admin" element={<AdminPage />} />
    <Route path="docs" element={<DeveloperDocsPage />} />
    <Route path="docs/:section" element={<DeveloperDocsSectionPage />} />
  </>
);

export default function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
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
    </Suspense>
  );
}
