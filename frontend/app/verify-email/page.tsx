'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trans, useTranslation } from 'react-i18next';

import { initI18n } from '@/i18n/config';
import { PageLayout } from '@/components/layout/PageLayout';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { apiClient } from '@/lib/api';

type VerificationState = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');
  const isInvalidLink = !uid || !token;
  const { t } = useTranslation();
  const [state, setState] = useState<VerificationState>(() =>
    isInvalidLink ? 'error' : 'loading'
  );
  const [message, setMessage] = useState(() =>
    isInvalidLink ? t('auth.verifyEmail.invalidLink') : t('auth.verifyEmail.loading')
  );

  useEffect(() => {
    if (isInvalidLink) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const verify = async () => {
      try {
        const response = await apiClient.verifyEmail({ uid: uid!, token: token! });
        setState('success');
        setMessage(response.detail ?? t('auth.verifyEmail.success'));
        timer = setTimeout(() => {
          router.replace('/login');
        }, 2000);
      } catch (error: unknown) {
        setState('error');
        if (error instanceof Error) {
          setMessage(error.message);
        } else {
          setMessage(t('auth.verifyEmail.error'));
        }
      }
    };

    void verify();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isInvalidLink, uid, token, router, t]);

  const renderContent = () => {
    if (state === 'loading') {
      return (
        <div className="flex items-center justify-center space-x-3">
          <InlineSpinner />
          <span className="text-sm text-gray-600">{message}</span>
        </div>
      );
    }

    const type = state === 'success' ? 'success' : 'error';

    return (
      <div className="space-y-4">
        <MessageAlert message={message} type={type} />
        {state === 'success' ? (
          <p className="text-center text-sm text-gray-600">
            <Trans
              i18nKey="auth.verifyEmail.redirect"
              components={{
                link: (
                  <Link href="/login" className="text-blue-600 hover:underline" />
                ),
              }}
            />
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <p>{t('auth.verifyEmail.retry')}</p>
            <p>
              <Trans
                i18nKey="auth.verifyEmail.backToLogin"
                components={{
                  link: (
                    <Link href="/login" className="text-blue-600 hover:underline" />
                  ),
                }}
              />
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">{t('auth.verifyEmail.title')}</h1>
          <p className="text-sm text-gray-600">
            {t('auth.verifyEmail.description')}
          </p>
        </div>
        {renderContent()}
      </div>
    </PageLayout>
  );
}

function VerifyEmailFallback() {
  const i18n = initI18n();

  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">{i18n.t('auth.verifyEmail.fallbackTitle')}</h1>
          <div className="flex items-center justify-center space-x-3">
            <InlineSpinner />
            <span className="text-sm text-gray-600">{i18n.t('auth.verifyEmail.fallbackLoading')}</span>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

