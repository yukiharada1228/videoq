import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import { CourseParticipantsDialog } from '../CourseParticipantsDialog';

vi.mock('@/lib/api', () => ({
  apiClient: {
    getCourseParticipants: vi.fn(),
    inviteCourseMembers: vi.fn(),
    resendCourseInvitation: vi.fn(),
    revokeCourseInvitation: vi.fn(),
    removeCourseMember: vi.fn(),
  },
}));

describe('CourseParticipantsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getCourseParticipants as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    (apiClient.inviteCourseMembers as ReturnType<typeof vi.fn>).mockResolvedValue({
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
      expect(apiClient.inviteCourseMembers).toHaveBeenCalledWith(3, ['a@example.com', 'bad']);
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
});
