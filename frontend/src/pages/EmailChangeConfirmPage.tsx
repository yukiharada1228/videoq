import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/lib/i18n';
import { apiClient } from '@/lib/api';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { UtilityLink } from '@/components/ui/utility-link';

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
      <UtilityLink asChild className="mb-12 inline-flex items-center text-sm font-bold">
        <Link href="/login">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('auth.emailChange.backToLogin')}
        </Link>
      </UtilityLink>

      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.emailChange.badge')}
          title={t('auth.emailChange.title')}
          description={t('auth.emailChange.description')}
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
              <UtilityLink asChild>
                <Link href="/login">{t('auth.emailChange.backToLogin')}</Link>
              </UtilityLink>
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-4">
            <MessageAlert type="error" message={message} />
            <UtilityLink asChild>
              <Link href="/login">{t('auth.emailChange.backToLogin')}</Link>
            </UtilityLink>
          </div>
        )}
      </div>

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
