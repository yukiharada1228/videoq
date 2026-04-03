import { useState } from 'react';
import { Link } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { useRequestPasswordResetMutation } from '@/hooks/usePasswordRecovery';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';
import { SeoHead } from '@/components/seo/SeoHead';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const requestResetMutation = useRequestPasswordResetMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(false);
    setError(null);

    try {
      await requestResetMutation.mutateAsync(email);
      setSuccess(true);
    } catch {
      setError(
        requestResetMutation.error instanceof Error
          ? requestResetMutation.error.message
          : requestResetMutation.error
            ? String(requestResetMutation.error)
            : null,
      );
    }
  };

  return (
    <AuthLayout>
      <SeoHead
        title={t('seo.auth.forgotPassword.title')}
        description={t('seo.auth.forgotPassword.description')}
        path="/forgot-password"
      />
      {/* Back Link */}
      <Link
        href="/login"
        className="inline-flex items-center text-[#00652c] font-bold text-sm mb-12 hover:opacity-80 transition-opacity"
      >
        <ArrowLeft className="mr-2 w-4 h-4" />
        {t('auth.forgotPassword.backToLogin')}
      </Link>

      {/* Content */}
      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.forgotPassword.badge')}
          title={t('auth.forgotPassword.title')}
          description={t('auth.forgotPassword.description')}
        />

        {/* Success Message */}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            {t('auth.forgotPassword.success')}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label
              className="block text-xs font-bold text-gray-900 uppercase tracking-widest"
              htmlFor="email"
            >
              {t('auth.fields.email.label')}
            </label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00652c] transition-colors w-4 h-4" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.fields.email.placeholder')}
                className="w-full pl-12 pr-4 py-4 bg-[#faf2eb] border-2 border-transparent rounded-xl focus:border-[#00652c] focus:bg-white focus:ring-0 transition-all text-gray-900 placeholder:text-gray-400 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={requestResetMutation.isPending}
            className="w-full py-4 bg-[#00652c] hover:bg-[#15803d] text-white font-bold rounded-xl shadow-lg shadow-[#00652c]/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {requestResetMutation.isPending ? (
              <>
                <InlineSpinner className="w-4 h-4" />
                {t('auth.forgotPassword.submitting')}
              </>
            ) : (
              <>
                {t('auth.forgotPassword.submit')}
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Links */}
        <div className="pt-8 text-center">
          <p className="text-sm text-gray-500">
            {t('auth.forgotPassword.noAccount')}{' '}
            <Link href="/signup" className="text-[#00652c] font-bold ml-1 hover:underline">
              {t('auth.forgotPassword.signUp')}
            </Link>
          </p>
        </div>
      </div>

      {/* Bottom Copyright */}
      <AuthPageFooter bordered align="left" />
    </AuthLayout>
  );
}
