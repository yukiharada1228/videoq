import { useState } from 'react';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { User, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';

export default function SignupPage() {
  const navigate = useI18nNavigate();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { formData, error, isLoading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data: { username: string; email: string; password: string; confirmPassword: string }) => {
      if (data.password !== data.confirmPassword) {
        throw new Error(t('auth.signup.passwordMismatch'));
      }
      await apiClient.signup({
        username: data.username,
        email: data.email,
        password: data.password,
      });
    },
    initialData: { username: '', email: '', password: '', confirmPassword: '' },
    onSuccessRedirect: () => navigate('/signup/check-email'),
  });

  return (
    <AuthLayout>
      <AuthPageIntro badge={t('auth.signup.badge')} title={t('auth.signup.title')} />

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Username */}
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

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 ml-1" htmlFor="email">
            {t('auth.fields.email.label')}
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              id="email"
              name="email"
              type="email"
              placeholder={t('auth.fields.email.placeholder')}
              value={formData.email || ''}
              onChange={handleChange}
              required
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] transition-all outline-none text-sm placeholder:text-gray-300"
            />
          </div>
        </div>

        {/* Password */}
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
              placeholder={t('auth.signup.passwordPlaceholder')}
              value={formData.password || ''}
              onChange={handleChange}
              required
              minLength={8}
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

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 ml-1" htmlFor="confirmPassword">
            {t('auth.fields.passwordConfirmation.label')}
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder={t('auth.fields.passwordConfirmation.placeholder')}
              value={formData.confirmPassword || ''}
              onChange={handleChange}
              required
              minLength={8}
              className="w-full pl-11 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] transition-all outline-none text-sm placeholder:text-gray-300"
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#00652c] transition-colors"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#00652c] text-white font-bold py-4 rounded-xl shadow-lg hover:bg-[#005323] hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] transition-all duration-200 mt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <InlineSpinner className="w-4 h-4" />
              {t('auth.signup.submitting')}
            </span>
          ) : (
            t('auth.signup.submit')
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-10 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <span className="relative px-4 bg-white text-xs text-gray-400 font-medium">{t('auth.signup.orDivider')}</span>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-0 text-center space-y-6">
        <p className="text-sm text-gray-500">
          {t('auth.signup.footerQuestion')}{' '}
          <Link href="/login" className="text-[#00652c] font-bold hover:underline ml-1">
            {t('auth.signup.footerLink')}
          </Link>
        </p>
        <AuthPageFooter />
      </div>
    </AuthLayout>
  );
}
