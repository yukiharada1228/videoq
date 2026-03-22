import { useState } from 'react';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';

export default function LoginPage() {
  const navigate = useI18nNavigate();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  const { formData, error, isLoading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data) => {
      await apiClient.login(data);
    },
    initialData: { username: '', password: '' },
    onSuccessRedirect: () => navigate('/'),
  });

  return (
    <AuthLayout>
      <AuthPageIntro badge={t('auth.login.badge')} title={t('auth.login.title')} />

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 ml-1" htmlFor="username">
            {t('auth.fields.username.label')}
          </label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              id="username"
              name="username"
              type="text"
              placeholder={t('auth.fields.username.placeholder')}
              value={formData.username || ''}
              onChange={handleChange}
              required
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] transition-all outline-none text-sm placeholder:text-gray-300"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 ml-1" htmlFor="password">
            {t('auth.fields.password.label')}
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.fields.password.placeholder')}
              value={formData.password || ''}
              onChange={handleChange}
              required
              className="w-full pl-11 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] transition-all outline-none text-sm placeholder:text-gray-300"
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#00652c] transition-colors"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between py-1">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-[#00652c] focus:ring-[#00652c]/30 cursor-pointer accent-[#00652c]"
            />
            <span className="text-xs text-gray-500 group-hover:text-[#00652c] transition-colors">
              {t('auth.login.rememberMe')}
            </span>
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-bold text-[#00652c] hover:text-[#005323] transition-colors"
          >
            {t('auth.login.forgotPassword')}
          </Link>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#00652c] text-white font-bold py-4 rounded-xl shadow-lg hover:bg-[#005323] hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <InlineSpinner className="w-4 h-4" />
              {t('auth.login.submitting')}
            </span>
          ) : (
            t('auth.login.submit')
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-10 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <span className="relative px-4 bg-white text-xs text-gray-400 font-medium">{t('auth.login.orDivider')}</span>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-0 text-center space-y-6">
        <p className="text-sm text-gray-500">
          {t('auth.login.footerQuestion')}{' '}
          <Link href="/signup" className="text-[#00652c] font-bold hover:underline ml-1">
            {t('auth.login.footerLink')}
          </Link>
        </p>
        <AuthPageFooter />
      </div>
    </AuthLayout>
  );
}
