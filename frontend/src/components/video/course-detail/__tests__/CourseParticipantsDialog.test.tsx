import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import { GroupParticipantsDialog } from '../GroupParticipantsDialog';

vi.mock('@/lib/api', () => ({
  apiClient: {
    getGroupParticipants: vi.fn(),
    inviteGroupMembers: vi.fn(),
    resendGroupInvitation: vi.fn(),
    revokeGroupInvitation: vi.fn(),
    removeGroupMember: vi.fn(),
  },
}));

describe('GroupParticipantsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getGroupParticipants as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    render(<GroupParticipantsDialog groupId={3} isOpen onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText('videos.groupMembers.emailLabel')).toHaveClass(
      'block',
      'w-full',
    );
  });

  it('bulk-invites comma or newline separated addresses and reports each result', async () => {
    (apiClient.inviteGroupMembers as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [
        { email: 'a@example.com', status: 'queued', invitation_id: 10 },
        { email: 'bad', status: 'invalid' },
      ],
    });

    render(<GroupParticipantsDialog groupId={3} isOpen onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('videos.groupMembers.emailLabel'), {
      target: { value: 'a@example.com,\nbad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'videos.groupMembers.invite' }));

    await waitFor(() => {
      expect(apiClient.inviteGroupMembers).toHaveBeenCalledWith(3, ['a@example.com', 'bad']);
    });
    expect(await screen.findByText('a@example.com')).toBeInTheDocument();
    expect(screen.getByText('videos.groupMembers.result.queued')).toBeInTheDocument();
    expect(screen.getByText('videos.groupMembers.result.invalid')).toBeInTheDocument();
  });

  it('previews normalized, invalid, duplicate, member, and pending recipients before sending', async () => {
    render(<GroupParticipantsDialog groupId={3} isOpen onOpenChange={vi.fn()} />);

    await screen.findByText('student@example.com');
    fireEvent.change(screen.getByLabelText('videos.groupMembers.emailLabel'), {
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

    expect(screen.getByText('videos.groupMembers.previewTitle')).toBeInTheDocument();
    expect(screen.getByText('videos.groupMembers.preview.ready')).toBeInTheDocument();
    expect(screen.getByText('videos.groupMembers.result.invalid')).toBeInTheDocument();
    expect(screen.getByText('videos.groupMembers.result.duplicate')).toBeInTheDocument();
    expect(screen.getByText('videos.groupMembers.result.already_member')).toBeInTheDocument();
    expect(screen.getByText('videos.groupMembers.result.already_invited')).toBeInTheDocument();
    expect(screen.getAllByText('new@example.com')).toHaveLength(2);
  });

  it('lists pending invitations and accepted members with owner controls', async () => {
    render(<GroupParticipantsDialog groupId={3} isOpen onOpenChange={vi.fn()} />);

    expect(await screen.findByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByText('student@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'videos.groupMembers.resend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'videos.groupMembers.revoke' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'videos.groupMembers.remove' })).toBeInTheDocument();
  });
});
