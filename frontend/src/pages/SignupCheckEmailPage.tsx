import { Link } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';

export default function SignupCheckEmailPage() {
  const { t } = useTranslation();

  return (
    <AuthLayout>
      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.checkEmail.badge')}
          title={t('auth.checkEmail.title')}
          description={t('auth.checkEmail.description')}
        />

        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <Mail className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-green-700">{t('auth.checkEmail.alert')}</p>
        </div>

        <p className="text-sm text-gray-500 text-center">
          {t('auth.checkEmail.help')}
        </p>

        <div className="text-center">
          <Link href="/login" className="text-[#00652c] font-bold text-sm hover:underline">
            {t('auth.checkEmail.backToLogin')}
          </Link>
        </div>
      </div>

      <AuthPageFooter bordered align="left" />
    </AuthLayout>
  );
}
