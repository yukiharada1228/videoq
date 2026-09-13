import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CourseParticipantsDialog } from '../CourseParticipantsDialog';

const getParticipants = vi.fn();
const inviteMembers = vi.fn();
const removeMember = vi.fn();
const resendInvitation = vi.fn();
const revokeInvitation = vi.fn();

const pendingInvitation = (id: number, email: string) => ({
  id,
  email,
  status: 'pending',
  delivery_status: 'sent',
  expires_at: '2026-08-29T00:00:00.000Z',
  created_at: '2026-08-22T00:00:00.000Z',
  last_sent_at: '2026-08-22T00:00:00.000Z',
  send_attempts: 1,
});

describe('CourseParticipantsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__setTrpcHandler('courseMemberships.participants', getParticipants);
    globalThis.__setTrpcHandler('courseMemberships.invite', inviteMembers);
    globalThis.__setTrpcHandler('courseMemberships.removeMember', removeMember);
    globalThis.__setTrpcHandler('courseMemberships.resend', resendInvitation);
    globalThis.__setTrpcHandler('courseMemberships.revoke', revokeInvitation);
    getParticipants.mockResolvedValue({
      invitations: [
        {
          id: 7,
          email: 'pending@example.com',
          status: 'pending',
          delivery_status: 'sent',
          expires_at: '2026-08-29T00:00:00.000Z',
          created_at: '2026-08-22T00:00:00.000Z',
          last_sent_at: '2026-08-22T00:00:00.000Z',
          send_attempts: 1,
        },
      ],
      members: [
        {
          user_id: 'student-user',
          username: 'student',
          email: 'student@example.com',
          joined_at: '2026-08-22T00:00:00.000Z',
        },
      ],
    });
  });

  it('renders the invitation textarea as a full-width block below its label', () => {
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText('videos.courseMembers.emailLabel')).toHaveClass(
      'block',
      'w-full',
    );
  });

  it('bulk-invites comma or newline separated addresses and reports each result', async () => {
    inviteMembers.mockResolvedValue({
      results: [
        { email: 'a@example.com', status: 'queued', invitation_id: 10 },
        { email: 'bad', status: 'invalid' },
      ],
    });

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('videos.courseMembers.emailLabel'), {
      target: { value: 'a@example.com,\nbad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'videos.courseMembers.invite' }));

    await waitFor(() => {
      expect(inviteMembers).toHaveBeenCalledWith({ courseId: 3, emails: ['a@example.com', 'bad'] });
    });
    expect(await screen.findByText('a@example.com')).toBeInTheDocument();
    expect(screen.getByText('videos.courseMembers.result.queued')).toBeInTheDocument();
    expect(screen.getByText('videos.courseMembers.result.invalid')).toBeInTheDocument();
  });

  it('previews normalized, invalid, duplicate, member, and pending recipients before sending', async () => {
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    await screen.findByText('student@example.com');
    fireEvent.change(screen.getByLabelText('videos.courseMembers.emailLabel'), {
      target: {
        value: [
          ' NEW@Example.com ',
          'bad',
          'new@example.com',
          'STUDENT@example.com',
          'pending@example.com',
        ].join(','),
      },
    });

    expect(screen.getByText('videos.courseMembers.previewTitle')).toBeInTheDocument();
    expect(screen.getByText('videos.courseMembers.preview.ready')).toBeInTheDocument();
    expect(screen.getByText('videos.courseMembers.result.invalid')).toBeInTheDocument();
    expect(screen.getByText('videos.courseMembers.result.duplicate')).toBeInTheDocument();
    expect(screen.getByText('videos.courseMembers.result.already_member')).toBeInTheDocument();
    expect(screen.getByText('videos.courseMembers.result.already_invited')).toBeInTheDocument();
    expect(screen.getAllByText('new@example.com')).toHaveLength(2);
  });

  it('lists pending invitations and accepted members with owner controls', async () => {
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    expect(await screen.findByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByText('student@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'videos.courseMembers.resend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'videos.courseMembers.revoke' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'videos.courseMembers.remove' })).toBeInTheDocument();
  });

  it.each([
    { action: 'resend' as const, handler: () => resendInvitation },
    { action: 'revoke' as const, handler: () => revokeInvitation },
  ])('shows a spinner on the invitation being $action-ed and not on the other rows', async ({ action, handler }) => {
    getParticipants.mockResolvedValue({
      invitations: [pendingInvitation(7, 'first@example.com'), pendingInvitation(8, 'second@example.com')],
      members: [],
    });
    let resolveAction: () => void = () => {};
    handler().mockImplementation(
      () => new Promise((resolve) => {
        resolveAction = () => resolve({});
      }),
    );

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    const buttons = await screen.findAllByRole('button', { name: `videos.courseMembers.${action}` });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(handler()).toHaveBeenCalledWith({ courseId: 3, invitationId: 7 });
    });

    const pending = screen.getAllByRole('button', { name: `videos.courseMembers.${action}` });
    expect(pending[0]).toHaveAttribute('aria-busy', 'true');
    expect(pending[1]).not.toHaveAttribute('aria-busy', 'true');
    expect(pending[0]).toBeDisabled();
    expect(pending[1]).toBeDisabled();

    resolveAction();

    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: `videos.courseMembers.${action}` })) {
        expect(button).not.toBeDisabled();
        expect(button).not.toHaveAttribute('aria-busy', 'true');
      }
    });
  });

  it('keeps the resend and revoke spinners independent of each other', async () => {
    getParticipants.mockResolvedValue({
      invitations: [pendingInvitation(7, 'first@example.com')],
      members: [],
    });
    let resolveResend: () => void = () => {};
    resendInvitation.mockImplementation(
      () => new Promise((resolve) => {
        resolveResend = () => resolve({});
      }),
    );

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'videos.courseMembers.resend' }));

    await waitFor(() => {
      expect(resendInvitation).toHaveBeenCalled();
    });

    // A pending resend must not make the revoke button claim to be busy.
    expect(screen.getByRole('button', { name: 'videos.courseMembers.resend' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'videos.courseMembers.revoke' })).not.toHaveAttribute('aria-busy', 'true');

    resolveResend();
  });

  it('blocks revoking an invitation while a resend is still in flight', async () => {
    getParticipants.mockResolvedValue({
      invitations: [pendingInvitation(7, 'first@example.com')],
      members: [],
    });
    let resolveResend: () => void = () => {};
    resendInvitation.mockImplementation(
      () => new Promise((resolve) => {
        resolveResend = () => resolve({});
      }),
    );

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'videos.courseMembers.resend' }));

    await waitFor(() => {
      expect(resendInvitation).toHaveBeenCalled();
    });

    // Both actions target the same invitation: the server rejects whichever
    // loses the race with CONFLICT (`This invitation is ...`), so only one
    // may be in flight at a time.
    expect(screen.getByRole('button', { name: 'videos.courseMembers.revoke' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'videos.courseMembers.revoke' }));
    expect(revokeInvitation).not.toHaveBeenCalled();

    resolveResend();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'videos.courseMembers.revoke' })).not.toBeDisabled();
    });
  });

  it('asks for confirmation before removing a member and does nothing when cancelled', async () => {
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'videos.courseMembers.remove' }));

    const confirmDialog = await screen.findByRole('dialog', { name: /confirmations\.removeMember/ });
    expect(within(confirmDialog).getByText('confirmations.removeMemberDescription')).toBeInTheDocument();
    expect(removeMember).not.toHaveBeenCalled();

    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'common.actions.cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /confirmations\.removeMember/ })).not.toBeInTheDocument();
    });
    expect(removeMember).not.toHaveBeenCalled();
  });

  it('removes the member only after the confirmation is accepted', async () => {
    removeMember.mockResolvedValue({});

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'videos.courseMembers.remove' }));

    const confirmDialog = await screen.findByRole('dialog', { name: /confirmations\.removeMember/ });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'videos.courseMembers.remove' }));

    await waitFor(() => {
      expect(removeMember).toHaveBeenCalledWith({ courseId: 3, userId: 'student-user' });
    });
  });

  it('shows a spinner on the member being removed and not on the other rows', async () => {
    getParticipants.mockResolvedValue({
      invitations: [],
      members: [
        { user_id: 'student-user', username: 'student', email: 'student@example.com', joined_at: '2026-08-22T00:00:00.000Z' },
        { user_id: 'other-user', username: 'other', email: 'other@example.com', joined_at: '2026-08-22T00:00:00.000Z' },
      ],
    });
    let resolveRemove: () => void = () => {};
    removeMember.mockImplementation(
      () => new Promise((resolve) => {
        resolveRemove = () => resolve({});
      }),
    );

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    const removeButtons = await screen.findAllByRole('button', { name: 'videos.courseMembers.remove' });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);

    const confirmDialog = await screen.findByRole('dialog', { name: /confirmations\.removeMember/ });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'videos.courseMembers.remove' }));

    await waitFor(() => {
      expect(removeMember).toHaveBeenCalledWith({ courseId: 3, userId: 'student-user' });
    });

    const pending = screen.getAllByRole('button', { name: 'videos.courseMembers.remove' });
    expect(pending[0]).toHaveAttribute('aria-busy', 'true');
    // The shared mutation already disables every row; only the targeted one
    // may claim to be busy.
    expect(pending[1]).not.toHaveAttribute('aria-busy', 'true');
    expect(pending[0]).toBeDisabled();
    expect(pending[1]).toBeDisabled();

    resolveRemove();

    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: 'videos.courseMembers.remove' })) {
        expect(button).not.toBeDisabled();
        expect(button).not.toHaveAttribute('aria-busy', 'true');
      }
    });
  });
});
