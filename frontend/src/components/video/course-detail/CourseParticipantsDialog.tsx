import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  apiClient,
  type CourseInviteRecipientResult,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogScrollArea,
  useDialog,
} from '@/components/ui/dialog';

/** 送信直後に配送状態を追う間隔と、追跡を打ち切るまでの時間。 */
const DELIVERY_POLL_INTERVAL_MS = 3_000;
const DELIVERY_POLL_WINDOW_MS = 30_000;

function splitEmails(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

type RecipientPreviewStatus =
  | 'ready'
  | 'invalid'
  | 'duplicate'
  | 'already_member'
  | 'already_invited';

type RecipientPreview = {
  email: string;
  status: RecipientPreviewStatus;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain || local.length > 64 || domain.length > 253) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (
    domain.startsWith('.')
    || domain.endsWith('.')
    || domain.startsWith('-')
    || domain.endsWith('-')
    || domain.includes('..')
  ) return null;
  return email;
}

function previewRecipients(
  inputs: readonly string[],
  memberEmails: ReadonlySet<string>,
  pendingEmails: ReadonlySet<string>,
): RecipientPreview[] {
  const seen = new Set<string>();
  return inputs.map((input) => {
    const normalized = normalizeEmail(input);
    if (!normalized) return { email: input, status: 'invalid' };
    if (seen.has(normalized)) return { email: normalized, status: 'duplicate' };
    seen.add(normalized);
    if (memberEmails.has(normalized)) {
      return { email: normalized, status: 'already_member' };
    }
    if (pendingEmails.has(normalized)) {
      return { email: normalized, status: 'already_invited' };
    }
    return { email: normalized, status: 'ready' };
  });
}

export function CourseParticipantsDialog({
  courseId,
  isOpen,
  onOpenChange,
}: {
  courseId: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [emailInput, setEmailInput] = useState('');
  const [inviteResults, setInviteResults] = useState<CourseInviteRecipientResult[]>([]);
  // メール送信はサーバー側のキューで進むので、送信直後だけ配送状態を追う。
  // 恒久的なポーリングにしないよう、追跡する期間を明示的に区切る。
  const [trackDeliveryUntil, setTrackDeliveryUntil] = useState(0);

  const participantsQuery = useQuery({
    queryKey: queryKeys.videoCourses.participants(courseId),
    queryFn: () => apiClient.getCourseParticipants(courseId),
    enabled: isOpen,
    refetchInterval: (query) => {
      if (Date.now() >= trackDeliveryUntil) return false;
      const queued = query.state.data?.invitations.some(
        (invitation) => invitation.delivery_status === 'queued',
      );
      return queued ? DELIVERY_POLL_INTERVAL_MS : false;
    },
  });
  const refresh = () => queryClient.invalidateQueries({
    queryKey: queryKeys.videoCourses.participants(courseId),
  });
  const inviteMutation = useMutation({
    mutationFn: (emails: string[]) => apiClient.inviteCourseMembers(courseId, emails),
    onSuccess: async ({ results }) => {
      setInviteResults(results);
      setEmailInput('');
      setTrackDeliveryUntil(Date.now() + DELIVERY_POLL_WINDOW_MS);
      await refresh();
    },
  });
  const resendMutation = useMutation({
    mutationFn: (invitationId: number) => apiClient.resendCourseInvitation(courseId, invitationId),
    onSuccess: () => {
      setTrackDeliveryUntil(Date.now() + DELIVERY_POLL_WINDOW_MS);
      return refresh();
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (invitationId: number) => apiClient.revokeCourseInvitation(courseId, invitationId),
    onSuccess: refresh,
  });
  const removeMutation = useMutation({
    mutationFn: (userId: string) => apiClient.removeCourseMember(courseId, userId),
    onSuccess: refresh,
  });

  const participants = participantsQuery.data;
  const emailInputs = useMemo(() => splitEmails(emailInput), [emailInput]);
  const recipientPreview = useMemo(() => {
    const memberEmails = new Set(
      participants?.members.map((member) => member.email.trim().toLowerCase()) ?? [],
    );
    const pendingEmails = new Set(
      participants?.invitations
        .filter((invitation) => invitation.status === 'pending')
        .map((invitation) => invitation.email.trim().toLowerCase()) ?? [],
    );
    return previewRecipients(emailInputs, memberEmails, pendingEmails);
  }, [emailInputs, participants]);
  const readyRecipientCount = recipientPreview.filter(({ status }) => status === 'ready').length;

  const dialog = useDialog({
    open: isOpen,
    onOpenChange,
    onRequestClose: (event) => {
      if (inviteMutation.isPending) event.preventDefault();
    },
  });
  if (!isOpen) return null;

  const mutationError = inviteMutation.error
    ?? resendMutation.error
    ?? revokeMutation.error
    ?? removeMutation.error;

  return (
    <Dialog {...dialog.dialogProps} scroll="inner" width="min(48rem, 95vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>{t('videos.courseMembers.title')}</DialogHeading>
        </DialogHeader>
        <DialogScrollArea>
          <DialogBody>
            <div className="space-y-8">
              <section className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="course-invitation-emails">{t('videos.courseMembers.emailLabel')}</Label>
                  <Textarea
                    id="course-invitation-emails"
                    rows={4}
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    disabled={inviteMutation.isPending}
                  />
                  <p className="text-dns-14N-130 text-solid-gray-600">
                    {t('videos.courseMembers.emailHelp')}
                  </p>
                </div>
                {recipientPreview.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-std-16B-170">{t('videos.courseMembers.previewTitle')}</h3>
                    <p className="text-dns-14N-130 text-solid-gray-600">
                      {t('videos.courseMembers.previewSummary', {
                        count: readyRecipientCount,
                        total: recipientPreview.length,
                      })}
                    </p>
                    <ul className="divide-y divide-solid-gray-200 border border-solid-gray-300">
                      {recipientPreview.map((recipient, index) => (
                        <li
                          key={`${recipient.email}-${index}`}
                          className="flex justify-between gap-4 px-4 py-3"
                        >
                          <span className="break-all">{recipient.email}</span>
                          <span>
                            {recipient.status === 'ready'
                              ? t('videos.courseMembers.preview.ready')
                              : t(`videos.courseMembers.result.${recipient.status}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Button
                  type="button"
                  onClick={() => inviteMutation.mutate(emailInputs)}
                  disabled={inviteMutation.isPending || readyRecipientCount === 0}
                >
                  {inviteMutation.isPending ? <InlineSpinner className="h-4 w-4" /> : null}
                  {t('videos.courseMembers.invite')}
                </Button>
                {inviteResults.length > 0 ? (
                  <ul className="divide-y divide-solid-gray-200 border border-solid-gray-300">
                    {inviteResults.map((result, index) => (
                      <li key={`${result.email}-${index}`} className="flex justify-between gap-4 px-4 py-3">
                        <span className="break-all">{result.email}</span>
                        <span>{t(`videos.courseMembers.result.${result.status}`)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              {mutationError ? (
                <ErrorMessage message={mutationError instanceof Error ? mutationError.message : t('common.messages.error')} />
              ) : null}

              {participantsQuery.isLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : participantsQuery.error ? (
                <ErrorMessage message={participantsQuery.error instanceof Error ? participantsQuery.error.message : t('common.messages.error')} />
              ) : (
                <>
                  <section className="space-y-3">
                    <h3 className="text-std-18B-160">{t('videos.courseMembers.membersTitle')}</h3>
                    {participants?.members.length ? (
                      <ul className="divide-y divide-solid-gray-200 border border-solid-gray-300">
                        {participants.members.map((member) => (
                          <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div>
                              <p className="font-bold">{member.username}</p>
                              <p className="break-all text-dns-14N-130 text-solid-gray-600">{member.email}</p>
                            </div>
                            <Button
                              type="button"
                              variant="text"
                              size="sm"
                              onClick={() => removeMutation.mutate(member.user_id)}
                              disabled={removeMutation.isPending}
                            >
                              {t('videos.courseMembers.remove')}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : <p>{t('videos.courseMembers.noMembers')}</p>}
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-std-18B-160">{t('videos.courseMembers.invitationsTitle')}</h3>
                    {participants?.invitations.length ? (
                      <ul className="divide-y divide-solid-gray-200 border border-solid-gray-300">
                        {participants.invitations.map((invitation) => (
                          <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div>
                              <p className="break-all font-bold">{invitation.email}</p>
                              <p className="text-dns-14N-130 text-solid-gray-600">
                                {t(`videos.courseMembers.status.${invitation.status}`)} / {t(`videos.courseMembers.delivery.${invitation.delivery_status}`)}
                              </p>
                            </div>
                            {invitation.status === 'pending' ? (
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => resendMutation.mutate(invitation.id)}
                                  disabled={resendMutation.isPending}
                                >
                                  {t('videos.courseMembers.resend')}
                                </Button>
                                <Button
                                  type="button"
                                  variant="text"
                                  size="sm"
                                  onClick={() => revokeMutation.mutate(invitation.id)}
                                  disabled={revokeMutation.isPending}
                                >
                                  {t('videos.courseMembers.revoke')}
                                </Button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : <p>{t('videos.courseMembers.noInvitations')}</p>}
                  </section>
                </>
              )}
            </div>
          </DialogBody>
        </DialogScrollArea>
        <DialogActions>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.close')}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
