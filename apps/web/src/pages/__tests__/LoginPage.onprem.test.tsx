import { render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import LoginPage from '../LoginPage';
import { useI18nNavigate } from '@/lib/i18n';

vi.mock('@/lib/deployment', () => ({ features: { publicSignup: false, googleLogin: false, emailDelivery: false } }));
vi.mock('@/lib/authSession', () => ({ useAuthSession: () => ({ data: { user: { id: 'signed-in-user' } }, isPending: false }) }));

it('resumes the signed-in on-prem user after the login form remounts during a cache replacement', async () => {
  const navigate = useI18nNavigate();
  render(<LoginPage />);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
});
