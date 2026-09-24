import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
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
    for (const handler of [getParticipants, inviteMembers, removeMember, resendInvitation, revokeInvitation]) handler.mockReset();
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

  afterEach(() => vi.useRealTimers());

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
    await waitFor(() => expect(screen.getByText('videos.courseMembers.result.queued').closest('ul')).toHaveFocus());
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

  it('marks the invite button as busy while the invitations are being sent', async () => {
    const onOpenChange = vi.fn();
    let resolveInvite: () => void = () => {};
    inviteMembers.mockImplementation(
      () => new Promise((resolve) => {
        resolveInvite = () => resolve({ results: [] });
      }),
    );

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText('videos.courseMembers.emailLabel'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'videos.courseMembers.invite' }));

    await waitFor(() => {
      expect(inviteMembers).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'videos.courseMembers.invite' })).toHaveAttribute('aria-busy', 'true');
    const close = screen.getByRole('button', { name: 'common.actions.close' });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveInvite();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'videos.courseMembers.invite' })).not.toHaveAttribute('aria-busy', 'true');
    });
    expect(close).toBeEnabled();
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
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

  it('keeps an operation error out of the scrollable area so it cannot scroll away', async () => {
    removeMember.mockRejectedValue(new Error('remove failed'));

    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'videos.courseMembers.remove' }));
    const confirmDialog = await screen.findByRole('dialog', { name: /confirmations\.removeMember/ });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'videos.courseMembers.remove' }));

    const alert = await screen.findByRole('alert');
    const scrollArea = document.querySelector('.modal-dialog-scroll-area');
    expect(scrollArea).not.toBeNull();
    // Inside the scroll area the message sits above both lists, so acting on a
    // row further down leaves the failure off screen.
    expect(scrollArea!.contains(alert)).toBe(false);
    await waitFor(() => expect(alert.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('shows the latest operation error when switching from invite to resend', async () => {
    inviteMembers.mockRejectedValue(new Error('Invite failed'));
    resendInvitation.mockRejectedValue(new Error('Resend failed'));
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);
    await screen.findByText('pending@example.com');
    fireEvent.change(screen.getByLabelText('videos.courseMembers.emailLabel'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'videos.courseMembers.invite' }));
    await screen.findByText('Invite failed');
    fireEvent.click(screen.getByRole('button', { name: 'videos.courseMembers.resend' }));
    expect(await screen.findByText('Resend failed')).toBeInTheDocument();
    expect(screen.queryByText('Invite failed')).not.toBeInTheDocument();
  });

  it('blocks all participant actions until invitation creation and its refresh finish', async () => {
    let finish!: () => void;
    inviteMembers.mockImplementation(() => new Promise(resolve => { finish = () => resolve({
      results: [{ email: 'new@example.com', status: 'queued', invitation_id: 8 }],
    }); }));
    const { result } = renderHook(() => useQueryClient());
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);
    await screen.findByText('pending@example.com');
    const original = result.current.getQueryData(trpc.courseMemberships.participants.queryKey({ courseId: 3 }))!;
    let finishRead!: (value: typeof original) => void;
    getParticipants.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    fireEvent.change(screen.getByLabelText('videos.courseMembers.emailLabel'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'videos.courseMembers.invite' }));
    await waitFor(() => expect(inviteMembers).toHaveBeenCalledTimes(1));
    for (const action of ['resend', 'revoke', 'remove']) {
      const button = screen.getByRole('button', { name: `videos.courseMembers.${action}` });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(resendInvitation).not.toHaveBeenCalled();
    expect(revokeInvitation).not.toHaveBeenCalled();
    expect(removeMember).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(getParticipants).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'videos.courseMembers.revoke' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'videos.courseMembers.remove' })).toBeDisabled();
    await act(async () => finishRead({ ...original, invitations: [
      ...original.invitations, { ...original.invitations[0], id: 8, email: 'new@example.com' },
    ] }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'videos.courseMembers.resend' })).toHaveLength(2));
    for (const button of screen.getAllByRole('button', { name: 'videos.courseMembers.resend' })) expect(button).toBeEnabled();
  });

  it('starts only one participant operation before the pending state renders', async () => {
    let finish!: () => void;
    resendInvitation.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ delivery_status: 'queued' }); }));
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);
    const resend = await screen.findByRole('button', { name: 'videos.courseMembers.resend' });
    const revoke = screen.getByRole('button', { name: 'videos.courseMembers.revoke' });
    act(() => { fireEvent.click(resend); fireEvent.click(revoke); fireEvent.click(resend); });
    await waitFor(() => expect(resendInvitation).toHaveBeenCalledTimes(1));
    expect(revokeInvitation).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(revoke).toBeEnabled());
  });

  it.each(['revoke', 'remove'] as const)('applies %s without reloading and ignores an older participant response', async (action) => {
    const { result } = renderHook(() => useQueryClient());
    render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={vi.fn()} />);
    await screen.findByText('pending@example.com');
    const filter = trpc.courseMemberships.participants.queryFilter({ courseId: 3 });
    const key = trpc.courseMemberships.participants.queryKey({ courseId: 3 });
    const original = result.current.getQueryData(key)!;
    let finish!: (value: typeof original) => void;
    getParticipants.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockRejectedValue(new Error('Do not reload after deletion'));
    let loading!: Promise<void>;
    act(() => { loading = result.current.refetchQueries(filter); });
    await waitFor(() => expect(getParticipants).toHaveBeenCalledTimes(2));
    revokeInvitation.mockResolvedValue({ success: true });
    removeMember.mockResolvedValue({ success: true });
    fireEvent.click(screen.getByRole('button', { name: `videos.courseMembers.${action}` }));
    if (action === 'remove') {
      const confirmation = await screen.findByRole('dialog', { name: /confirmations\.removeMember/ });
      fireEvent.click(within(confirmation).getByRole('button', { name: 'videos.courseMembers.remove' }));
    }
    await waitFor(() => {
      if (action === 'revoke') expect(screen.queryByRole('button', { name: 'videos.courseMembers.revoke' })).not.toBeInTheDocument();
      else expect(screen.queryByText('student@example.com')).not.toBeInTheDocument();
    });
    await act(async () => { finish(original); await loading; });
    const current = result.current.getQueryData(key)!;
    if (action === 'revoke') {
      expect(current.invitations[0]).toEqual({ ...original.invitations[0], status: 'revoked' });
      expect(current.members).toEqual(original.members);
    } else {
      expect(current.members).toEqual([]);
      expect(current.invitations).toEqual(original.invitations);
    }
    expect(getParticipants).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  async function startDeliveryPolling() {
    getParticipants.mockResolvedValue({
      members: [],
      invitations: [{ ...pendingInvitation(7, 'pending@example.com'), delivery_status: 'queued' }],
    });
    resendInvitation.mockResolvedValue({ delivery_status: 'queued' });
    const onOpenChange = vi.fn();
    const view = render(<CourseParticipantsDialog courseId={3} isOpen onOpenChange={onOpenChange} />);
    const resend = await screen.findByRole('button', { name: 'videos.courseMembers.resend' });
    vi.useFakeTimers();
    fireEvent.click(resend);
    await act(() => vi.advanceTimersByTimeAsync(50));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(resendInvitation).toHaveBeenCalledTimes(1);
    expect(getParticipants).toHaveBeenCalledTimes(2);
    expect(resend).toBeEnabled();
    return { ...view, onOpenChange };
  }

  it.each(['sent', 'failed'])('stops polling when delivery becomes %s', async (deliveryStatus) => {
    await startDeliveryPolling();
    getParticipants.mockResolvedValue({
      members: [],
      invitations: [{ ...pendingInvitation(7, 'pending@example.com'), delivery_status: deliveryStatus }],
    });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(screen.getByText(`videos.courseMembers.status.pending / videos.courseMembers.delivery.${deliveryStatus}`)).toBeInTheDocument();
    const reads = getParticipants.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(getParticipants).toHaveBeenCalledTimes(reads);
  });

  it('stops polling after thirty seconds even when delivery remains queued', async () => {
    await startDeliveryPolling();
    for (let interval = 0; interval < 10; interval++) {
      await act(() => vi.advanceTimersByTimeAsync(3000));
      await act(() => vi.advanceTimersByTimeAsync(50));
    }
    expect(getParticipants.mock.calls.length).toBeGreaterThan(2);
    const reads = getParticipants.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(getParticipants).toHaveBeenCalledTimes(reads);
  });

  it('stops delivery polling immediately after the queued invitation is revoked', async () => {
    await startDeliveryPolling();
    revokeInvitation.mockResolvedValue({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'videos.courseMembers.revoke' }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByText('videos.courseMembers.status.revoked / videos.courseMembers.delivery.queued')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(getParticipants).toHaveBeenCalledTimes(2);
  });

  it.each(['hidden', 'unmounted'])('stops polling when the dialog is %s', async (state) => {
    const { rerender, unmount, onOpenChange } = await startDeliveryPolling();
    if (state === 'unmounted') unmount();
    else rerender(<CourseParticipantsDialog courseId={3} isOpen={false} onOpenChange={onOpenChange} />);
    const reads = getParticipants.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(getParticipants).toHaveBeenCalledTimes(reads);
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
