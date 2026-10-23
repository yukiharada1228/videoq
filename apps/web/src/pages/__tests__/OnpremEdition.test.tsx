import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import LoginPage from '../LoginPage';
import SettingsPage from '../SettingsPage';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppNav } from '@/components/layout/AppNav';
import { OnpremUserProvisioning, ResetUserAccessButton } from '@/components/auth/OnpremUserProvisioning';

vi.mock('@/lib/deployment', () => ({ isOnprem: true, features: {
  billing: false, marketing: false, publicSignup: false, googleLogin: false, youtube: false, emailDelivery: false,
} }));

beforeEach(() => {
  globalThis.__setMockAuthSession({ user: { id: "1", name: "operator" } });
  globalThis.__setTrpcHandler('account.me', async () => ({ id: '1', username: 'operator', email: 'operator@example.test', is_admin: true }));
  globalThis.__setTrpcHandler('account.integrationApiKeys', async () => []);
  globalThis.__setTrpcHandler('account.connectedApps', async () => []);
});

describe('on-prem user flows', () => {
  it('provides local sign-in with administrator help, without SaaS sign-up or Google actions', () => {
    render(<LoginPage />);
    expect(screen.getByText('onprem.loginHelp')).toBeInTheDocument();
    expect(document.querySelector('a[href*="signup"], a[href*="forgot-password"]')).toBeNull();
    expect(screen.queryByText('auth.login.orDivider')).not.toBeInTheDocument();
    expect(screen.queryByText('auth.login.google')).not.toBeInTheDocument();
  });
  it('excludes commercial pages from navigation and footer', async () => {
    render(<><AppNav /><AppFooter /></>);
    expect(document.querySelector('a[href="/"]')).not.toBeNull();
    for (const page of ['pricing', 'terms', 'privacy', 'refund', 'legal', 'signup']) {
      expect(document.querySelector(`a[href="/${page}"]`), page).toBeNull();
    }
  });
  it('keeps account and local API settings while avoiding billing and SearchAPI requests', async () => {
    const external = vi.fn(() => { throw new Error('Disabled API was requested'); });
    globalThis.__setTrpcHandler('account.searchApiKeyStatus', external);
    render(<SettingsPage />);
    await screen.findByText('settings.title');
    expect(document.querySelector('#billing, #youtube')).toBeNull();
    expect(document.querySelector('#account, #integrations')).not.toBeNull();
    expect(external).not.toHaveBeenCalled();
  });
  it('lets an administrator create an account and receive a private setup link', async () => {
    const create = vi.fn(async () => ({ id: 'new-user', username: 'new_user', email: 'new@example.test', activation_url: 'https://intranet.test/setup-secret' }));
    globalThis.__setTrpcHandler('admin.createUser', create);
    render(<OnpremUserProvisioning />);
    fireEvent.change(screen.getByLabelText('auth.fields.username.label'), { target: { value: 'new_user' } });
    fireEvent.change(screen.getByLabelText('auth.fields.email.label'), { target: { value: 'new@example.test' } });
    fireEvent.submit(screen.getByLabelText('auth.fields.email.label').closest('form')!);
    expect(await screen.findByLabelText('onprem.activationLink')).toHaveValue('https://intranet.test/setup-secret');
    expect(create).toHaveBeenCalledWith({ username: 'new_user', email: 'new@example.test' });
  });
  it('provides administrator-assisted password recovery', async () => {
    const reset = vi.fn(async () => ({ activation_url: 'https://intranet.test/recovery-secret' }));
    globalThis.__setTrpcHandler('admin.resetAccess', reset);
    render(<ResetUserAccessButton id="user-id" username="alice" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(reset).toHaveBeenCalledWith({ id: 'user-id' }));
    expect(await screen.findByLabelText('onprem.activationLink')).toHaveValue('https://intranet.test/recovery-secret');
  });
});
