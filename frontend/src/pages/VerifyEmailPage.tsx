import { Suspense, useEffect } from 'react';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { UtilityLink } from '@/components/ui/utility-link';
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

  return (
    <AuthLayout>
      <UtilityLink asChild className="mb-12 inline-flex items-center text-sm font-bold">
        <Link href="/login">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('auth.verifyEmail.backToLogin')}
        </Link>
      </UtilityLink>

      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.verifyEmail.badge')}
          title={t('auth.verifyEmail.title')}
          description={t('auth.verifyEmail.description')}
        />

        {state === 'loading' && (
          <div className="flex items-center gap-3 rounded-8 border border-solid-gray-300 bg-solid-gray-50 p-4">
            <InlineSpinner />
            <span className="text-sm text-solid-gray-700">{message}</span>
          </div>
        )}

        {state === 'success' && (
          <div className="space-y-4">
            <MessageAlert type="success" message={message} />
            <p className="text-center text-sm text-solid-gray-600">
              {t('auth.verifyEmail.redirectPart1')}{' '}
              <UtilityLink asChild>
                <Link href="/login">{t('auth.verifyEmail.redirectLink')}</Link>
              </UtilityLink>
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-4">
            <MessageAlert type="error" message={message} />
            <div className="space-y-2 text-sm text-solid-gray-600">
              <p>{t('auth.verifyEmail.retry')}</p>
              <UtilityLink asChild>
                <Link href="/login">{t('auth.verifyEmail.backToLogin')}</Link>
              </UtilityLink>
            </div>
          </div>
        )}
      </div>

    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </AuthLayout>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
