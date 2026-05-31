import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Link } from '@/lib/i18n';
import { apiClient } from '@/lib/api';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

type EmailChangeState = 'loading' | 'success' | 'error';

function EmailChangeConfirmContent() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');
  const { t } = useTranslation();
  const isInvalidLink = !uid || !token;

  const confirmQuery = useQuery({
    queryKey: ['emailChangeConfirm', uid ?? null, token ?? null],
    enabled: !isInvalidLink,
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      await apiClient.confirmEmailChange({ uid: uid!, token: token! });
      return {};
    },
  });

  let state: EmailChangeState;
  let message: string;

  if (isInvalidLink) {
    state = 'error';
    message = t('auth.emailChange.invalidLink');
  } else if (confirmQuery.isPending) {
    state = 'loading';
    message = t('auth.emailChange.loading');
  } else if (confirmQuery.isSuccess) {
    state = 'success';
    message = t('auth.emailChange.success');
  } else if (confirmQuery.isError) {
    state = 'error';
    message = confirmQuery.error instanceof Error
      ? confirmQuery.error.message
      : t('auth.emailChange.error');
  } else {
    state = 'loading';
    message = t('auth.emailChange.loading');
  }

  return (
    <AuthLayout>
      <Link
        href="/login"
        className="inline-flex items-center text-[#00652c] font-bold text-sm mb-12 hover:opacity-80 transition-opacity"
      >
        <ArrowLeft className="mr-2 w-4 h-4" />
        {t('auth.emailChange.backToLogin')}
      </Link>

      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.emailChange.badge')}
          title={t('auth.emailChange.title')}
          description={t('auth.emailChange.description')}
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
              <Link href="/login" className="text-[#00652c] font-bold hover:underline">
                {t('auth.emailChange.backToLogin')}
              </Link>
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {message}
            </div>
            <Link href="/login" className="text-[#00652c] font-bold hover:underline block text-sm">
              {t('auth.emailChange.backToLogin')}
            </Link>
          </div>
        )}
      </div>

      <AuthPageFooter bordered align="left" />
    </AuthLayout>
  );
}

export default function EmailChangeConfirmPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </AuthLayout>
    }>
      <EmailChangeConfirmContent />
    </Suspense>
  );
}
