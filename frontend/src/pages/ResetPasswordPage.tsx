import { Suspense, useState } from 'react';
import { Link } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, KeyRound, Lock } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SeoHead } from '@/components/seo/SeoHead';
import { useConfirmPasswordResetMutation } from '@/hooks/usePasswordRecovery';

function ResetPasswordContent() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';
  const { t } = useTranslation();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetPasswordMutation = useConfirmPasswordResetMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);
    setError(null);

    if (!uid || !token) {
      setClientError(t('auth.resetPassword.invalidLink'));
      return;
    }

    if (password !== confirmPassword) {
      setClientError(t('auth.resetPassword.passwordMismatch'));
      return;
    }

    try {
      await resetPasswordMutation.mutateAsync({ uid, token, newPassword: password });
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError(
        resetPasswordMutation.error instanceof Error
          ? resetPasswordMutation.error.message
          : resetPasswordMutation.error
            ? String(resetPasswordMutation.error)
            : null,
      );
    }
  };

  return (
    <AuthLayout>
      <SeoHead
        title={t('seo.auth.resetPassword.title')}
        description={t('seo.auth.resetPassword.description')}
        path="/reset-password"
      />
      <Link
        href="/login"
        className="inline-flex items-center text-[#00652c] font-bold text-sm mb-12 hover:opacity-80 transition-opacity"
      >
        <ArrowLeft className="mr-2 w-4 h-4" />
        {t('auth.resetPassword.backToLogin')}
      </Link>

      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.resetPassword.badge')}
          title={t('auth.resetPassword.title')}
          description={t('auth.resetPassword.description')}
        />

        {(clientError || error) && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {clientError ?? error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            {t('auth.resetPassword.success')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-900 uppercase tracking-widest" htmlFor="password">
              {t('auth.resetPassword.newPassword')}
            </label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00652c] transition-colors w-4 h-4" />
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                className="w-full pl-12 pr-4 py-4 bg-[#faf2eb] border-2 border-transparent rounded-xl focus:border-[#00652c] focus:bg-white focus:ring-0 transition-all text-gray-900 placeholder:text-gray-400 outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-900 uppercase tracking-widest" htmlFor="confirmPassword">
              {t('auth.resetPassword.confirmPassword')}
            </label>
            <div className="relative group">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00652c] transition-colors w-4 h-4" />
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                className="w-full pl-12 pr-4 py-4 bg-[#faf2eb] border-2 border-transparent rounded-xl focus:border-[#00652c] focus:bg-white focus:ring-0 transition-all text-gray-900 placeholder:text-gray-400 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={resetPasswordMutation.isPending}
            className="w-full py-4 bg-[#00652c] hover:bg-[#15803d] text-white font-bold rounded-xl shadow-lg shadow-[#00652c]/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetPasswordMutation.isPending ? (
              <><InlineSpinner className="w-4 h-4" />{t('auth.resetPassword.submitting')}</>
            ) : t('auth.resetPassword.submit')}
          </button>
        </form>

        {success && (
          <div className="text-center">
            <Link href="/login" className="text-[#00652c] font-bold text-sm hover:underline">
              {t('auth.resetPassword.backToLogin')}
            </Link>
          </div>
        )}
      </div>

      <AuthPageFooter bordered align="left" />
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </AuthLayout>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
