import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/lib/api';
import { useAuthSession } from '@/lib/authSession';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { Button } from '@/components/ui/button';
import { ChipLabel } from '@/components/ui/chip-label';
import { UtilityLink } from '@/components/ui/utility-link';

export default function CourseInvitationPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const navigate = useI18nNavigate();
  const session = useAuthSession();
  const [decision, setDecision] = useState<'declined' | null>(null);

  const invitationQuery = useQuery({
    queryKey: queryKeys.videoCourses.invitation(token),
    queryFn: () => apiClient.getCourseInvitation(token),
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiClient.acceptCourseInvitation(token),
    onSuccess: (result) => navigate(`/videos/courses/${result.course_id}`),
  });
  const declineMutation = useMutation({
    mutationFn: () => apiClient.declineCourseInvitation(token),
    onSuccess: () => setDecision('declined'),
  });

  const invitation = invitationQuery.data;
  const isSignedIn = Boolean(session.data?.user);
  const nextParam = encodeURIComponent(`/course-invitations/${token}`);
  const actionError = acceptMutation.error ?? declineMutation.error;

  return (
    <AuthLayout>
      <AuthPageIntro
        badge={t('courseInvitation.badge')}
        title={t('courseInvitation.title')}
        description={t('courseInvitation.description')}
      />

      {invitationQuery.isLoading || session.isPending ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : invitationQuery.error || !invitation ? (
        <ErrorMessage message={t('courseInvitation.notFound')} />
      ) : decision === 'declined' ? (
        <MessageAlert type="success" message={t('courseInvitation.declined')} />
      ) : (
        <div className="space-y-6">
          <div className="space-y-4 border border-solid-gray-420 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-std-20B-150 text-solid-gray-800">{invitation.course_name}</h2>
              <ChipLabel variant="filled-1" color="gray">
                {t(`courseInvitation.status.${invitation.status}`)}
              </ChipLabel>
            </div>
            <dl className="space-y-3 text-std-16N-170">
              <div>
                <dt className="text-solid-gray-600">{t('courseInvitation.inviter')}</dt>
                <dd className="font-bold text-solid-gray-800">{invitation.inviter_name}</dd>
              </div>
              <div>
                <dt className="text-solid-gray-600">{t('courseInvitation.recipient')}</dt>
                <dd className="font-mono text-solid-gray-800">{invitation.email_hint}</dd>
              </div>
            </dl>
          </div>

          {actionError ? <ErrorMessage message={actionError instanceof Error ? actionError.message : t('common.messages.error')} /> : null}

          {invitation.status !== 'pending' ? (
            <div className="space-y-4">
              <MessageAlert
                type="warning"
                message={t(`courseInvitation.terminal.${invitation.status}`)}
              />
              {invitation.status === 'accepted' ? (
                <Button asChild variant="solid" size="lg">
                  <Link href={`/videos/courses/${invitation.course_id}`}>
                    {t('courseInvitation.openCourse')}
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : isSignedIn ? (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="solid"
                size="lg"
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending || declineMutation.isPending}
              >
                {acceptMutation.isPending ? <InlineSpinner className="h-4 w-4" /> : null}
                {t('courseInvitation.accept')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => declineMutation.mutate()}
                disabled={acceptMutation.isPending || declineMutation.isPending}
              >
                {declineMutation.isPending ? <InlineSpinner className="h-4 w-4" /> : null}
                {t('courseInvitation.decline')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <MessageAlert type="warning" message={t('courseInvitation.authRequired')} />
              <div className="flex flex-wrap gap-4">
                <Button asChild variant="solid" size="lg">
                  <Link href={`/login?next=${nextParam}`}>{t('courseInvitation.login')}</Link>
                </Button>
                <UtilityLink asChild>
                  <Link href={`/signup?next=${nextParam}`}>{t('courseInvitation.signup')}</Link>
                </UtilityLink>
              </div>
            </div>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
