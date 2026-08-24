import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import { useI18nNavigate } from '@/lib/i18n';
import CourseInvitationPage from '../CourseInvitationPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ token: 'invite-token' }) };
});

vi.mock('@/lib/api', () => ({
  apiClient: {
    getCourseInvitation: vi.fn(),
    acceptCourseInvitation: vi.fn(),
    declineCourseInvitation: vi.fn(),
  },
}));

const preview = {
  course_id: 12,
  course_name: 'Physics 101',
  inviter_name: 'Teacher',
  email_hint: 's*****t@example.com',
  status: 'pending' as const,
  expires_at: '2026-08-29T00:00:00.000Z',
};

describe('CourseInvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getCourseInvitation as ReturnType<typeof vi.fn>).mockResolvedValue(preview);
  });

  it('shows a public masked preview and asks anonymous recipients to sign in', async () => {
    globalThis.__setMockAuthSession(null);

    render(<CourseInvitationPage />);

    expect(await screen.findByText('Physics 101')).toBeInTheDocument();
    expect(screen.getByText('s*****t@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'courseInvitation.accept' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'courseInvitation.login' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcourse-invitations%2Finvite-token',
    );
    expect(screen.getByRole('link', { name: 'courseInvitation.signup' })).toHaveAttribute(
      'href',
      '/signup?next=%2Fcourse-invitations%2Finvite-token',
    );
  });

  it('accepts while signed in and opens the joined course', async () => {
    (apiClient.acceptCourseInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
      course_id: 12,
      status: 'accepted',
    });
    const navigate = useI18nNavigate() as ReturnType<typeof vi.fn>;

    render(<CourseInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'courseInvitation.accept' }));

    await waitFor(() => {
      expect(apiClient.acceptCourseInvitation).toHaveBeenCalledWith('invite-token');
      expect(navigate).toHaveBeenCalledWith('/videos/courses/12');
    });
  });

  it('allows a signed-in recipient to decline', async () => {
    (apiClient.declineCourseInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'declined',
    });

    render(<CourseInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'courseInvitation.decline' }));

    expect(await screen.findByText('courseInvitation.declined')).toBeInTheDocument();
  });

  it('offers the course detail link for an already accepted invitation', async () => {
    (apiClient.getCourseInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...preview,
      status: 'accepted',
    });

    render(<CourseInvitationPage />);

    expect(await screen.findByRole('link', { name: 'courseInvitation.openCourse' })).toHaveAttribute(
      'href',
      '/videos/courses/12',
    );
    expect(screen.queryByRole('button', { name: 'courseInvitation.accept' })).not.toBeInTheDocument();
  });

  it.each(['accepted', 'declined', 'expired', 'revoked'] as const)(
    'resolves the status chip and terminal message for %s',
    async (status) => {
      (apiClient.getCourseInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...preview,
        status,
      });

      render(<CourseInvitationPage />);

      // `.undefined` に落ちていないこと（i18n キーが具体値で解決されること）。
      expect(await screen.findByText(`courseInvitation.status.${status}`)).toBeInTheDocument();
      expect(screen.getByText(`courseInvitation.terminal.${status}`)).toBeInTheDocument();
      expect(screen.queryByText(/courseInvitation\.(status|terminal)\.undefined/)).toBeNull();
    },
  );

  it('shows the pending status chip while the invitation is open', async () => {
    render(<CourseInvitationPage />);

    expect(await screen.findByText('courseInvitation.status.pending')).toBeInTheDocument();
    expect(screen.queryByText(/courseInvitation\.status\.undefined/)).toBeNull();
  });
});
