import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { useI18nNavigate } from '@/lib/i18n';
import CourseInvitationPage from '../CourseInvitationPage';

const getInvitation = vi.fn();
const acceptInvitation = vi.fn();
const declineInvitation = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ token: 'invite-token' }) };
});

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
    getInvitation.mockReset();
    acceptInvitation.mockReset().mockResolvedValue({ course_id: 12, status: 'accepted' });
    declineInvitation.mockReset().mockResolvedValue({ status: 'declined' });
    globalThis.__setTrpcHandler('courseMemberships.preview', getInvitation);
    globalThis.__setTrpcHandler('courseMemberships.accept', acceptInvitation);
    globalThis.__setTrpcHandler('courseMemberships.decline', declineInvitation);
    getInvitation.mockResolvedValue(preview);
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
    acceptInvitation.mockResolvedValue({
      course_id: 12,
      status: 'accepted',
    });
    const navigate = useI18nNavigate() as ReturnType<typeof vi.fn>;

    render(<CourseInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'courseInvitation.accept' }));

    await waitFor(() => {
      expect(acceptInvitation).toHaveBeenCalledWith({ token: 'invite-token' });
      expect(navigate).toHaveBeenCalledWith('/videos/courses/12');
    });
  });

  it('allows a signed-in recipient to decline', async () => {
    declineInvitation.mockResolvedValue({
      status: 'declined',
    });

    render(<CourseInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'courseInvitation.decline' }));

    expect(await screen.findByText('courseInvitation.declined')).toBeInTheDocument();
  });

  it('reports the latest error when changing the invitation decision and permits retry', async () => {
    acceptInvitation.mockRejectedValueOnce(new Error('Accept failed'));
    declineInvitation.mockRejectedValueOnce(new Error('Decline failed'));
    render(<CourseInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'courseInvitation.accept' }));
    await screen.findByText('Accept failed');
    fireEvent.click(screen.getByRole('button', { name: 'courseInvitation.decline' }));
    expect(await screen.findByText('Decline failed')).toBeInTheDocument();
    expect(screen.queryByText('Accept failed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'courseInvitation.decline' }));
    expect(await screen.findByText('courseInvitation.declined')).toBeInTheDocument();
    expect(screen.queryByText('Decline failed')).not.toBeInTheDocument();
    expect(declineInvitation).toHaveBeenCalledTimes(2);
  });

  it.each(['accept', 'decline'] as const)('keeps a successful %s in the preview cache when an older read finishes', async (action) => {
    const { result } = renderHook(() => useQueryClient());
    render(<CourseInvitationPage />);
    await screen.findByText('Physics 101');
    let finish!: () => void;
    getInvitation.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(preview); }));
    let loading!: Promise<void>;
    act(() => { loading = result.current.refetchQueries(trpc.courseMemberships.preview.queryFilter({ token: 'invite-token' })); });
    await waitFor(() => expect(getInvitation).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: `courseInvitation.${action}` }));
    await waitFor(() => expect(result.current.getQueryData(trpc.courseMemberships.preview.queryKey({ token: 'invite-token' }))?.status)
      .toBe(action === 'accept' ? 'accepted' : 'declined'));
    await act(async () => { finish(); await loading; });
    expect(result.current.getQueryData(trpc.courseMemberships.preview.queryKey({ token: 'invite-token' })))
      .toEqual({ ...preview, status: action === 'accept' ? 'accepted' : 'declined' });
    expect(getInvitation).toHaveBeenCalledTimes(2);
  });

  it('does not redirect after the recipient has left the invitation page', async () => {
    let finish!: () => void;
    acceptInvitation.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ course_id: 12, status: 'accepted' }); }));
    const { result } = renderHook(() => useQueryClient());
    const navigate = useI18nNavigate() as ReturnType<typeof vi.fn>;
    const { unmount } = render(<CourseInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'courseInvitation.accept' }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => finish());
    await waitFor(() => expect(result.current.isMutating()).toBe(0));
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.getQueryData(trpc.courseMemberships.preview.queryKey({ token: 'invite-token' }))?.status).toBe('accepted');
  });

  it('sends only the first decision when both actions are clicked before the next render', async () => {
    let finish!: () => void;
    acceptInvitation.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ course_id: 12, status: 'accepted' }); }));
    render(<CourseInvitationPage />);
    const accept = await screen.findByRole('button', { name: 'courseInvitation.accept' });
    const decline = screen.getByRole('button', { name: 'courseInvitation.decline' });
    act(() => { fireEvent.click(accept); fireEvent.click(decline); fireEvent.click(accept); });
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(1));
    expect(declineInvitation).not.toHaveBeenCalled();
    expect(accept).toBeDisabled();
    expect(decline).toBeDisabled();
    await act(async () => finish());
  });

  it('offers the course detail link for an already accepted invitation', async () => {
    getInvitation.mockResolvedValue({
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
      getInvitation.mockResolvedValue({
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
