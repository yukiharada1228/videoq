'use client';

import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { PageLayout } from '@/components/layout/PageLayout';
import { MessageAlert } from '@/components/common/MessageAlert';

export default function SignupCheckEmailPage() {
  const t = useTranslations();

  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">{t('auth.checkEmail.title')}</h1>
          <p className="text-sm text-gray-600">
            {t('auth.checkEmail.description')}
          </p>
        </div>
        <MessageAlert
          type="success"
          message={t('auth.checkEmail.alert')}
        />
        <div className="text-center text-sm text-gray-600">
          {t('auth.checkEmail.help')}
        </div>
        <div className="text-center text-sm">
          <Link href="/login" className="text-blue-600 hover:underline">
            {t('auth.checkEmail.backToLogin')}
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}

