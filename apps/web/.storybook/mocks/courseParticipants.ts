import { fn } from 'storybook/test';
import type { CourseParticipants, CourseInviteRecipientResult } from '@videoq/trpc';
import { invitation, participants } from '../fixtures/courseParticipants';
import { failure, pending, success, trpcHandler, trpcMutation, trpcQuery } from './network';

type Outcome = 'pending' | 'error' | 'retry';
export interface ParticipantsScenario {
  data?: CourseParticipants;
  load?: 'pending' | 'error';
  invite?: Outcome;
  resend?: Outcome;
  revoke?: Outcome;
  remove?: Outcome;
  results?: CourseInviteRecipientResult[];
  delivery?: 'sent' | 'failed' | 'queued';
  refetchPending?: boolean;
}
export const participantsRequest = fn();
export const inviteRequest = fn();
export const resendRequest = fn();
export const revokeRequest = fn();
export const removeRequest = fn();
export const operationError = '操作を完了できませんでした / Could not complete the request';
export const loadError = '参加者を読み込めませんでした / Could not load participants';

export function participantsHandler(scenario: ParticipantsScenario = {}) {
  const data = structuredClone(scenario.data ?? participants);
  const attempts = { invite: 0, resend: 0, revoke: 0, remove: 0 };
  let changed = false;
  let deliveryReads = 0;
  let trackedIds: number[] = [];
  for (const request of [participantsRequest, inviteRequest, resendRequest, revokeRequest, removeRequest]) request.mockClear();
  const resultFor = (action: keyof typeof attempts) => {
    attempts[action]++;
    const outcome = scenario[action];
    if (outcome === 'pending') return pending();
    if (outcome === 'error' || (outcome === 'retry' && attempts[action] === 1)) return failure(operationError);
    return null;
  };
  return trpcHandler([
    trpcQuery('courseMemberships.participants', input => {
      participantsRequest(input);
      if (scenario.load === 'pending' || (changed && scenario.refetchPending)) return pending();
      if (scenario.load === 'error') return failure(loadError);
      if (trackedIds.length && ++deliveryReads >= 2 && scenario.delivery && scenario.delivery !== 'queued') {
        data.invitations = data.invitations.map(item => trackedIds.includes(item.id) ? { ...item, delivery_status: scenario.delivery as 'sent' | 'failed' } : item);
      }
      return success(data);
    }),
    trpcMutation('courseMemberships.invite', input => {
      inviteRequest(input);
      const error = resultFor('invite');
      if (error) return error;
      const results = scenario.results ?? input.emails.map((email, index): CourseInviteRecipientResult => ({ email: email.toLowerCase(), status: 'queued', invitation_id: 90 + index }));
      const queued = results.filter(result => result.status === 'queued');
      const added = queued.map((result, index) => invitation(result.invitation_id ?? 90 + index, result.email, { delivery_status: 'queued', last_sent_at: null }));
      data.invitations.push(...added);
      changed = true; deliveryReads = 0; trackedIds = added.map(item => item.id);
      return success({ results });
    }),
    trpcMutation('courseMemberships.resend', input => {
      resendRequest(input);
      const error = resultFor('resend');
      if (error) return error;
      data.invitations = data.invitations.map(item => item.id === input.invitationId ? { ...item, delivery_status: 'queued', send_attempts: item.send_attempts + 1 } : item);
      changed = true; deliveryReads = 0; trackedIds = [input.invitationId];
      return success({ delivery_status: 'queued' as const });
    }),
    trpcMutation('courseMemberships.revoke', input => {
      revokeRequest(input);
      const error = resultFor('revoke');
      if (error) return error;
      data.invitations = data.invitations.map(item => item.id === input.invitationId ? { ...item, status: 'revoked' } : item);
      changed = true;
      return success({ success: true as const });
    }),
    trpcMutation('courseMemberships.removeMember', input => {
      removeRequest(input);
      const error = resultFor('remove');
      if (error) return error;
      data.members = data.members.filter(member => member.user_id !== input.userId);
      changed = true;
      return success({ success: true as const });
    }),
  ]);
}
