import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { addLocalePrefix, getPreferredLocale, useLocaleSync } from '@/lib/i18n';
import { defaultLocale, locales, type Locale } from '@/i18n/config';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const HomePage = lazy(() => import('@/pages/HomePage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const SignupCheckEmailPage = lazy(() => import('@/pages/SignupCheckEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
const VideosPage = lazy(() => import('@/pages/VideosPage'));
const VideoDetailPage = lazy(() => import('@/pages/VideoDetailPage'));
const VideoGroupsPage = lazy(() => import('@/pages/VideoGroupsPage'));
const VideoGroupDetailPage = lazy(() => import('@/pages/VideoGroupDetailPage'));
const SharePage = lazy(() => import('@/pages/SharePage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const DeveloperDocsPage = lazy(() => import('@/pages/DeveloperDocsPage'));
const DeveloperDocsSectionPage = lazy(() => import('@/pages/DeveloperDocsSectionPage'));
const BillingPage = lazy(() => import('@/pages/BillingPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage'));
const CommercialDisclosurePage = lazy(() => import('@/pages/CommercialDisclosurePage'));
const UseCaseEducationPage = lazy(() => import('@/pages/UseCaseEducationPage'));
const UseCaseCorporateTrainingPage = lazy(() => import('@/pages/UseCaseCorporateTrainingPage'));

function LocaleGate() {
  const params = useParams<{ locale?: string }>();
  const location = useLocation();
  const locale = params.locale;

  // Must be called unconditionally (rules-of-hooks)
  useLocaleSync();

  if (locale && !locales.includes(locale as Locale)) {
    return <Navigate to="/" replace />;
  }

  // If user prefers non-default locale, redirect to /:locale/... automatically.
  if (!locale) {
    const preferred = getPreferredLocale();
    if (preferred !== defaultLocale) {
      const nextPath = addLocalePrefix(location.pathname, preferred) + location.search;
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
    <Route path="videos" element={<VideosPage />} />
    <Route path="videos/:id" element={<VideoDetailPage />} />
    <Route path="videos/groups" element={<VideoGroupsPage />} />
    <Route path="videos/groups/:id" element={<VideoGroupDetailPage />} />
    <Route path="share/:token" element={<SharePage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="docs" element={<DeveloperDocsPage />} />
    <Route path="docs/:section" element={<DeveloperDocsSectionPage />} />
    <Route path="billing" element={<BillingPage />} />
    <Route path="terms" element={<TermsPage />} />
    <Route path="privacy" element={<PrivacyPolicyPage />} />
    <Route path="commercial-disclosure" element={<CommercialDisclosurePage />} />
    <Route path="use-cases/education" element={<UseCaseEducationPage />} />
    <Route path="use-cases/corporate-training" element={<UseCaseCorporateTrainingPage />} />
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
