import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { authFixtures } from '../../../../.storybook/fixtures/auth';
import { courseId, participants, emptyParticipants, englishParticipants, historyParticipants, longParticipants, longEmail, manyParticipants, mixedEmails, mixedResults } from '../../../../.storybook/fixtures/courseParticipants';
import { participantsHandler, participantsRequest, inviteRequest, resendRequest, revokeRequest, removeRequest, loadError, operationError, type ParticipantsScenario } from '../../../../.storybook/mocks/courseParticipants';
import { CourseParticipantsDialog } from './CourseParticipantsDialog';

function ParticipantsExample(args: ComponentProps<typeof CourseParticipantsDialog>) {
  const [open, setOpen] = useState(args.isOpen);
  return <>
    <Button onClick={() => setOpen(true)}>{i18n.t('videos.courseMembers.open')}</Button>
    <CourseParticipantsDialog {...args} isOpen={open} onOpenChange={value => { args.onOpenChange(value); setOpen(value); }} />
  </>;
}
const meta = {
  title: 'Video/CourseParticipantsDialog',
  component: CourseParticipantsDialog,
  args: { courseId, isOpen: false, onOpenChange: fn() },
  render: args => <ParticipantsExample key={`${args.courseId}:${args.isOpen}`} {...args} />,
  parameters: { api: { auth: authFixtures.user }, docs: { story: { inline: false, height: '950px' } } },
  beforeEach({ parameters, msw }) { msw.use(participantsHandler(parameters.participants as ParticipantsScenario | undefined)); },
  async play({ canvas, userEvent }) {
    if (!canvas.queryByRole('dialog')) await userEvent.click(canvas.getByRole('button', { name: i18n.t('videos.courseMembers.open') }));
    await expect(within(await canvas.findByRole('dialog')).getByRole('heading', { level: 2 })).toHaveFocus();
  },
} satisfies Meta<typeof CourseParticipantsDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story['play']>>[0];
const label = (key: string) => i18n.t(`videos.courseMembers.${key}`);

async function openLoaded(context: Context) {
  await meta.play(context);
  const dialog = within(context.canvas.getByRole('dialog'));
  await dialog.findByRole('heading', { name: label('membersTitle') });
  return dialog;
}
function mainDialog(context: Context) { return context.canvas.getByRole('dialog', { name: label('title') }); }
function row(context: Context, text: string) {
  const element = within(mainDialog(context)).getByText(text).closest('li');
  if (!element) throw new Error(`Row not found: ${text}`);
  return within(element);
}
async function fillRecipients(context: Context, value = 'learner@example.com') {
  const dialog = await openLoaded(context);
  await context.userEvent.type(dialog.getByRole('textbox', { name: label('emailLabel') }), value);
  return dialog;
}
async function invite(context: Context, value?: string) {
  const dialog = await fillRecipients(context, value);
  await context.userEvent.click(dialog.getByRole('button', { name: label('invite') }));
  return dialog;
}
async function requestRemoval(context: Context, member = participants.members[0]) {
  await openLoaded(context);
  await context.userEvent.click(row(context, member.email).getByRole('button', { name: label('remove') }));
  const title = i18n.t('confirmations.removeMember', { name: member.username });
  return within(await context.canvas.findByRole('dialog', { name: title }));
}
async function remove(context: Context, member = participants.members[0]) {
  const confirm = await requestRemoval(context, member);
  await context.userEvent.click(confirm.getByRole('button', { name: label('remove') }));
  await waitFor(() => expect(context.canvas.queryByRole('dialog', { name: i18n.t('confirmations.removeMember', { name: member.username }) })).not.toBeInTheDocument());
  return within(mainDialog(context));
}

export const Loaded: Story = { async play(context) {
  const dialog = await openLoaded(context);
  await expect(dialog.getByText(participants.members[0].email)).toBeVisible();
  await expect(dialog.getAllByRole('button', { name: label('resend') })).toHaveLength(2);
} };
export const Loading: Story = {
  parameters: { participants: { load: 'pending' } satisfies ParticipantsScenario },
  async play(context) { await meta.play(context); await expect(within(mainDialog(context)).getByRole('progressbar')).toBeVisible(); },
};
export const Empty: Story = {
  parameters: { participants: { data: emptyParticipants } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await openLoaded(context);
    await expect(dialog.getByText(label('noMembers'))).toBeVisible();
    await expect(dialog.getByText(label('noInvitations'))).toBeVisible();
  },
};
export const LoadFailed: Story = {
  parameters: { participants: { load: 'error' } satisfies ParticipantsScenario },
  async play(context) { await meta.play(context); await expect(await within(mainDialog(context)).findByRole('alert')).toHaveTextContent(loadError); },
};
export const InvitationHistory: Story = {
  parameters: { participants: { data: historyParticipants } satisfies ParticipantsScenario },
  async play(context) {
    await openLoaded(context);
    for (const item of historyParticipants.invitations) {
      const historyRow = row(context, item.email);
      await expect(historyRow.getByText(`${label(`status.${item.status}`)} / ${label(`delivery.${item.delivery_status}`)}`)).toBeVisible();
      if (item.status !== 'pending') await expect(historyRow.queryByRole('button')).not.toBeInTheDocument();
    }
  },
};
export const ManyParticipants: Story = {
  parameters: { participants: { data: manyParticipants } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await openLoaded(context);
    dialog.getByText(manyParticipants.invitations.at(-1)!.email).scrollIntoView({ block: 'nearest' });
    await expect(mainDialog(context).querySelector('.modal-dialog-scroll-area')!.scrollTop).toBeGreaterThan(0);
    const close = dialog.getByRole('button', { name: i18n.t('common.actions.close') });
    await expect(close.getBoundingClientRect().bottom).toBeLessThanOrEqual(context.canvasElement.ownerDocument.documentElement.clientHeight);
  },
};
export const LongContentMobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { participants: { data: longParticipants } satisfies ParticipantsScenario },
  async play(context) {
    await fillRecipients(context, longEmail + ';' + longEmail);
    const content = mainDialog(context).querySelector('[data-slot="dialog-content"]')!;
    await expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth);
    await expect(within(mainDialog(context)).getByText(label('result.already_member')).getBoundingClientRect().height).toBeLessThan(40);
    await expect(within(mainDialog(context)).getByRole('button', { name: label('invite') })).toBeDisabled();
  },
};
export const EnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  parameters: { participants: { data: englishParticipants } satisfies ParticipantsScenario },
  async play(context) { await openLoaded(context); },
};
export const MixedRecipientPreview: Story = { async play(context) {
  const dialog = await fillRecipients(context, mixedEmails.join(';'));
  for (const status of ['invalid', 'duplicate', 'already_member', 'already_invited']) await expect(dialog.getByText(label(`result.${status}`))).toBeVisible();
  await expect(dialog.getByText(label('preview.ready'))).toBeVisible();
  await expect(inviteRequest).not.toHaveBeenCalled();
} };
export const NoReadyRecipients: Story = { async play(context) {
  const dialog = await fillRecipients(context, 'invalid-address;hanako@example.com;pending@example.com');
  await expect(dialog.getByRole('button', { name: label('invite') })).toBeDisabled();
  await expect(inviteRequest).not.toHaveBeenCalled();
} };
export const Inviting: Story = {
  parameters: { participants: { invite: 'pending' } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await invite(context);
    await waitFor(() => expect(dialog.getByRole('button', { name: label('invite') })).toHaveAttribute('aria-busy', 'true'));
    await expect(dialog.getByRole('textbox')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: i18n.t('common.actions.close') })).toBeDisabled();
    mainDialog(context).dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(mainDialog(context)).toBeVisible();
    await expect(context.args.onOpenChange).not.toHaveBeenCalled();
  },
};
export const MixedInviteResults: Story = {
  parameters: { participants: { results: mixedResults } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await invite(context, mixedEmails.join(';'));
    await waitFor(() => expect(dialog.getByRole('textbox')).toHaveValue(''));
    await expect(inviteRequest).toHaveBeenCalledWith({ courseId, emails: mixedEmails });
    for (const status of ['queued', 'invalid', 'duplicate', 'already_member', 'already_invited']) await expect(dialog.getByText(label(`result.${status}`))).toBeVisible();
    await waitFor(() => expect(dialog.getByText(label('result.duplicate')).closest('[tabindex="-1"]')).toHaveFocus());
  },
};
export const LongResultsMobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { participants: { data: emptyParticipants } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await invite(context, longEmail);
    await waitFor(() => expect(dialog.getByText(label('result.queued')).closest('[tabindex="-1"]')).toHaveFocus());
    const content = mainDialog(context).querySelector('[data-slot="dialog-content"]')!;
    await expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth);
    await expect(dialog.getByText(label('result.queued')).getBoundingClientRect().height).toBeLessThan(40);
  },
};
export const InviteFailed: Story = {
  parameters: { participants: { invite: 'error' } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await invite(context);
    await expect(await dialog.findByRole('alert')).toHaveTextContent(operationError);
    await expect(dialog.getByRole('textbox')).toHaveValue('learner@example.com');
    await expect(dialog.getByRole('button', { name: label('invite') })).toBeEnabled();
    await waitFor(() => expect(dialog.getByRole('alert').closest('[tabindex="-1"]')).toHaveFocus());
  },
};
export const InviteFailureThenRetry: Story = {
  parameters: { participants: { invite: 'retry' } satisfies ParticipantsScenario },
  async play(context) {
    await InviteFailed.play!(context);
    const dialog = within(mainDialog(context));
    await context.userEvent.click(dialog.getByRole('button', { name: label('invite') }));
    await waitFor(() => expect(dialog.getByRole('textbox')).toHaveValue(''));
    await expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    await expect(inviteRequest).toHaveBeenCalledTimes(2);
  },
};
export const InviteRefetchPending: Story = {
  parameters: { participants: { refetchPending: true } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await invite(context);
    await waitFor(() => expect(participantsRequest).toHaveBeenCalledTimes(2));
    await expect(dialog.getByRole('button', { name: label('invite') })).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.getByRole('textbox')).toBeDisabled();
  },
};

async function invitationAction(context: Context, action: 'resend' | 'revoke') {
  await openLoaded(context);
  await context.userEvent.click(row(context, 'pending@example.com').getByRole('button', { name: label(action) }));
  return within(mainDialog(context));
}
async function assertInvitationPending(context: Context, action: 'resend' | 'revoke') {
  const dialog = await invitationAction(context, action);
  await waitFor(() => expect(row(context, 'pending@example.com').getByRole('button', { name: label(action) })).toHaveAttribute('aria-busy', 'true'));
  for (const item of ['resend', 'revoke']) {
    for (const button of dialog.getAllByRole('button', { name: label(item) })) await expect(button).toBeDisabled();
    await expect(row(context, 'retry@example.com').getByRole('button', { name: label(item) })).toHaveAttribute('aria-busy', 'false');
  }
}
export const Resending: Story = { parameters: { participants: { resend: 'pending' } satisfies ParticipantsScenario }, async play(context) { await assertInvitationPending(context, 'resend'); } };
export const Revoking: Story = { parameters: { participants: { revoke: 'pending' } satisfies ParticipantsScenario }, async play(context) { await assertInvitationPending(context, 'revoke'); } };
export const ResendQueued: Story = { async play(context) {
  await invitationAction(context, 'resend');
  await expect(await row(context, 'pending@example.com').findByText(`${label('status.pending')} / ${label('delivery.queued')}`)).toBeVisible();
  await expect(resendRequest).toHaveBeenCalledWith({ courseId, invitationId: 7 });
} };
export const RevokeSucceeded: Story = { async play(context) {
  await invitationAction(context, 'revoke');
  await expect(await row(context, 'pending@example.com').findByText(`${label('status.revoked')} / ${label('delivery.sent')}`)).toBeVisible();
  await expect(row(context, 'pending@example.com').queryByRole('button')).not.toBeInTheDocument();
  await expect(revokeRequest).toHaveBeenCalledWith({ courseId, invitationId: 7 });
  await expect(within(mainDialog(context)).getByRole('heading', { level: 2 })).toHaveFocus();
} };
export const ResendFailed: Story = {
  parameters: { participants: { resend: 'error' } satisfies ParticipantsScenario },
  async play(context) { const dialog = await invitationAction(context, 'resend'); await expect(await dialog.findByRole('alert')).toHaveTextContent(operationError); },
};
export const RevokeFailed: Story = {
  parameters: { participants: { revoke: 'error' } satisfies ParticipantsScenario },
  async play(context) { const dialog = await invitationAction(context, 'revoke'); await expect(await dialog.findByRole('alert')).toHaveTextContent(operationError); },
};
export const RemoveConfirmation: Story = { async play(context) { await requestRemoval(context); await expect(removeRequest).not.toHaveBeenCalled(); } };
export const CancelRemoval: Story = { async play(context) {
  const confirm = await requestRemoval(context);
  await context.userEvent.click(confirm.getByRole('button', { name: i18n.t('common.actions.cancel') }));
  await expect(removeRequest).not.toHaveBeenCalled();
  await expect(row(context, participants.members[0].email).getByRole('button', { name: label('remove') })).toHaveFocus();
} };
export const Removing: Story = {
  parameters: { participants: { remove: 'pending' } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await remove(context);
    await waitFor(() => expect(row(context, participants.members[0].email).getByRole('button', { name: label('remove') })).toHaveAttribute('aria-busy', 'true'));
    for (const button of dialog.getAllByRole('button', { name: label('remove') })) await expect(button).toBeDisabled();
    await expect(row(context, participants.members[1].email).getByRole('button', { name: label('remove') })).toHaveAttribute('aria-busy', 'false');
  },
};
export const RemoveSucceeded: Story = { async play(context) {
  const dialog = await remove(context);
  await waitFor(() => expect(dialog.queryByText(participants.members[0].email)).not.toBeInTheDocument());
  await expect(removeRequest).toHaveBeenCalledWith({ courseId, userId: participants.members[0].user_id });
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveFocus();
} };
export const RemoveFailed: Story = {
  parameters: { participants: { remove: 'error' } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await remove(context);
    await expect(await dialog.findByRole('alert')).toHaveTextContent(operationError);
    await expect(dialog.getByText(participants.members[0].email)).toBeVisible();
  },
};
export const ErrorOutsideScrollArea: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { participants: { data: manyParticipants, revoke: 'error' } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await openLoaded(context);
    await context.userEvent.click(row(context, manyParticipants.invitations.at(-1)!.email).getByRole('button', { name: label('revoke') }));
    const alert = await dialog.findByRole('alert');
    const scroller = mainDialog(context).querySelector('.modal-dialog-scroll-area')!;
    await expect(scroller).not.toContainElement(alert);
    await expect(scroller.scrollTop).toBeGreaterThan(0);
    await expect(alert.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    await expect(alert.getBoundingClientRect().bottom).toBeLessThanOrEqual(context.canvasElement.ownerDocument.documentElement.clientHeight);
  },
};
export const KeyboardInvite: Story = { async play(context) {
  const dialog = await openLoaded(context);
  await context.userEvent.tab();
  await expect(dialog.getByRole('textbox')).toHaveFocus();
  await context.userEvent.keyboard('keyboard@example.com');
  await context.userEvent.tab();
  await expect(dialog.getByRole('button', { name: label('invite') })).toHaveFocus();
  await context.userEvent.keyboard('{Enter}');
  await waitFor(() => expect(dialog.getByRole('textbox')).toHaveValue(''));
  await expect(inviteRequest).toHaveBeenCalledWith({ courseId, emails: ['keyboard@example.com'] });
  await waitFor(() => expect(dialog.getByText(label('result.queued')).closest('[tabindex="-1"]')).toHaveFocus());
} };
export const KeyboardRemoveLastMember: Story = {
  parameters: { participants: { data: { members: [participants.members[0]], invitations: [] } } satisfies ParticipantsScenario },
  async play(context) {
    const dialog = await openLoaded(context);
    const button = dialog.getByRole('button', { name: label('remove') });
    button.focus(); await context.userEvent.keyboard('{Enter}');
    const confirm = within(await context.canvas.findByRole('dialog', { name: i18n.t('confirmations.removeMember', { name: participants.members[0].username }) }));
    await context.userEvent.tab();
    await expect(confirm.getByRole('button', { name: i18n.t('common.actions.cancel') })).toHaveFocus();
    await context.userEvent.tab(); await context.userEvent.keyboard('{Enter}');
    await expect(await dialog.findByText(label('noMembers'))).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveFocus();
  },
};
export const CloseAndReopen: Story = { async play(context) {
  const dialog = await fillRecipients(context);
  await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.close') }));
  await expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument();
  await expect(context.canvas.getByRole('button', { name: label('open') })).toHaveFocus();
  await meta.play(context);
} };
export const EscapeRequest: Story = { async play(context) {
  await openLoaded(context);
  mainDialog(context).dispatchEvent(new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument());
  await expect(context.canvas.getByRole('button', { name: label('open') })).toHaveFocus();
} };
export const DeliveryPolling: Story = {
  parameters: { participants: { delivery: 'sent' } satisfies ParticipantsScenario },
  async play(context) {
    await ResendQueued.play!(context);
    await waitFor(() => expect(row(context, 'pending@example.com').getByText(`${label('status.pending')} / ${label('delivery.sent')}`)).toBeVisible(), { timeout: 5000 });
    const reads = participantsRequest.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 3200));
    await expect(participantsRequest).toHaveBeenCalledTimes(reads);
  },
};
export const DeliveryFailed: Story = {
  parameters: { participants: { delivery: 'failed' } satisfies ParticipantsScenario },
  async play(context) {
    await ResendQueued.play!(context);
    await waitFor(() => expect(row(context, 'pending@example.com').getByText(`${label('status.pending')} / ${label('delivery.failed')}`)).toBeVisible(), { timeout: 5000 });
    await expect(row(context, 'pending@example.com').getByRole('button', { name: label('resend') })).toBeEnabled();
  },
};
export const PollingStopsWhenClosed: Story = { async play(context) {
  await ResendQueued.play!(context);
  await context.userEvent.click(within(mainDialog(context)).getByRole('button', { name: i18n.t('common.actions.close') }));
  await expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument();
  const reads = participantsRequest.mock.calls.length;
  await new Promise(resolve => setTimeout(resolve, 3200));
  await expect(participantsRequest).toHaveBeenCalledTimes(reads);
} };
