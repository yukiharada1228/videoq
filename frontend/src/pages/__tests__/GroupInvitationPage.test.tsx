import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import { useI18nNavigate } from '@/lib/i18n';
import GroupInvitationPage from '../GroupInvitationPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ token: 'invite-token' }) };
});

vi.mock('@/lib/api', () => ({
  apiClient: {
    getGroupInvitation: vi.fn(),
    acceptGroupInvitation: vi.fn(),
    declineGroupInvitation: vi.fn(),
  },
}));

const preview = {
  group_id: 12,
  group_name: 'Physics 101',
  inviter_name: 'Teacher',
  email_hint: 's*****t@example.com',
  status: 'pending' as const,
  expires_at: '2026-08-29T00:00:00.000Z',
};

describe('GroupInvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getGroupInvitation as ReturnType<typeof vi.fn>).mockResolvedValue(preview);
  });

  it('shows a public masked preview and asks anonymous recipients to sign in', async () => {
    globalThis.__setMockAuthSession(null);

    render(<GroupInvitationPage />);

    expect(await screen.findByText('Physics 101')).toBeInTheDocument();
    expect(screen.getByText('s*****t@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'groupInvitation.accept' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'groupInvitation.login' })).toHaveAttribute(
      'href',
      '/login?next=%2Fgroup-invitations%2Finvite-token',
    );
    expect(screen.getByRole('link', { name: 'groupInvitation.signup' })).toHaveAttribute(
      'href',
      '/signup?next=%2Fgroup-invitations%2Finvite-token',
    );
  });

  it('accepts while signed in and opens the joined group', async () => {
    (apiClient.acceptGroupInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
      group_id: 12,
      status: 'accepted',
    });
    const navigate = useI18nNavigate() as ReturnType<typeof vi.fn>;

    render(<GroupInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'groupInvitation.accept' }));

    await waitFor(() => {
      expect(apiClient.acceptGroupInvitation).toHaveBeenCalledWith('invite-token');
      expect(navigate).toHaveBeenCalledWith('/videos/groups/12');
    });
  });

  it('allows a signed-in recipient to decline', async () => {
    (apiClient.declineGroupInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'declined',
    });

    render(<GroupInvitationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'groupInvitation.decline' }));

    expect(await screen.findByText('groupInvitation.declined')).toBeInTheDocument();
  });

  it('offers the group detail link for an already accepted invitation', async () => {
    (apiClient.getGroupInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...preview,
      status: 'accepted',
    });

    render(<GroupInvitationPage />);

    expect(await screen.findByRole('link', { name: 'groupInvitation.openGroup' })).toHaveAttribute(
      'href',
      '/videos/groups/12',
    );
    expect(screen.queryByRole('button', { name: 'groupInvitation.accept' })).not.toBeInTheDocument();
  });
});
