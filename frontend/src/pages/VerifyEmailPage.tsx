import { Suspense, useEffect } from 'react';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MailCheck, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
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
      <Link
        href="/login"
        className="inline-flex items-center text-[#00652c] font-bold text-sm mb-12 hover:opacity-80 transition-opacity"
      >
        <ArrowLeft className="mr-2 w-4 h-4" />
        {t('auth.verifyEmail.backToLogin')}
      </Link>

      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.verifyEmail.badge')}
          title={t('auth.verifyEmail.title')}
          description={t('auth.verifyEmail.description')}
        />

        {state === 'loading' && (
          <div className="flex items-center gap-3 p-4 bg-[#f8faf5] rounded-xl border border-[#d3e8d3]">
            <InlineSpinner className="w-4 h-4 text-[#00652c]" />
            <span className="text-sm text-[#3f493f]">{message}</span>
          </div>
        )}

        {state === 'success' && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
              <MailCheck className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <p className="text-sm text-green-700">{message}</p>
            </div>
            <p className="text-sm text-gray-500 text-center">
              {t('auth.verifyEmail.redirectPart1')}{' '}
              <Link href="/login" className="text-[#00652c] font-bold hover:underline">
                {t('auth.verifyEmail.redirectLink')}
              </Link>
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {message}
            </div>
            <div className="space-y-2 text-sm text-gray-500">
              <p>{t('auth.verifyEmail.retry')}</p>
              <Link href="/login" className="text-[#00652c] font-bold hover:underline block">
                {t('auth.verifyEmail.backToLogin')}
              </Link>
            </div>
          </div>
        )}
      </div>

      <AuthPageFooter bordered align="left" />
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
