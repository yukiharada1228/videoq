import { Suspense, useEffect } from 'react';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { PageLayout } from '@/components/layout/PageLayout';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { useVerifyEmailQuery } from '@/hooks/useVerifyEmailData';

type VerificationState = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const navigate = useI18nNavigate();
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');
  const { t } = useTranslation();
  const { verifyQuery, isInvalidLink } = useVerifyEmailQuery({ uid, token });

  useEffect(() => {
    if (isInvalidLink || !verifyQuery.isSuccess) {
      return;
    }

    const timer = setTimeout(() => {
      navigate('/login', { replace: true });
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [isInvalidLink, navigate, verifyQuery.isSuccess]);

  let state: VerificationState;
  let message: string;

  if (isInvalidLink) {
    state = 'error';
    message = t('auth.verifyEmail.invalidLink');
  } else if (verifyQuery.isPending) {
    state = 'loading';
    message = t('auth.verifyEmail.loading');
  } else if (verifyQuery.isSuccess) {
    state = 'success';
    message = verifyQuery.data?.detail ?? t('auth.verifyEmail.success');
  } else if (verifyQuery.isError) {
    state = 'error';
    message = verifyQuery.error instanceof Error ? verifyQuery.error.message : t('auth.verifyEmail.error');
  } else {
    state = 'loading';
    message = t('auth.verifyEmail.loading');
  }

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
            {t('auth.verifyEmail.redirectPart1')}{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              {t('auth.verifyEmail.redirectLink')}
            </Link>
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <p>{t('auth.verifyEmail.retry')}</p>
            <p>
              <Link href="/login" className="text-blue-600 hover:underline">
                {t('auth.verifyEmail.backToLogin')}
              </Link>
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
  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Email verification</h1>
          <div className="flex items-center justify-center space-x-3">
            <InlineSpinner />
            <span className="text-sm text-gray-600">Checking your email verification...</span>
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
