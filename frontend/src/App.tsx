import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { addLocalePrefix, getPreferredLocale, useLocaleSync } from '@/lib/i18n';
import { defaultLocale, locales, type Locale } from '@/i18n/config';

import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/SignupPage';
import SignupCheckEmailPage from '@/pages/SignupCheckEmailPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import SettingsPage from '@/pages/SettingsPage';
import VideosPage from '@/pages/VideosPage';
import VideoDetailPage from '@/pages/VideoDetailPage';
import VideoGroupsPage from '@/pages/VideoGroupsPage';
import VideoGroupDetailPage from '@/pages/VideoGroupDetailPage';
import SharePage from '@/pages/SharePage';

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
    <Route path="settings" element={<SettingsPage />} />
    <Route path="videos" element={<VideosPage />} />
    <Route path="videos/:id" element={<VideoDetailPage />} />
    <Route path="videos/groups" element={<VideoGroupsPage />} />
    <Route path="videos/groups/:id" element={<VideoGroupDetailPage />} />
    <Route path="share/:token" element={<SharePage />} />
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
