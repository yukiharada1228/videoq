import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import { ConnectedAppsSection } from '../ConnectedAppsSection';

type Tokens = Awaited<ReturnType<typeof apiClient.getAuthorizedOAuthTokens>>;
const tokens: Tokens = [
  { id: 'classroom', client_id: 'classroom', client_name: 'Classroom', scope: 'video:read', issued_at: '2026-09-01T09:00:00Z', expires_at: null },
  { id: 'notes', client_id: 'notes', client_name: 'Notes', scope: '', issued_at: '2026-09-02T09:00:00Z', expires_at: '2026-10-02T09:00:00Z' },
];
const listTokens = vi.mocked(apiClient.getAuthorizedOAuthTokens);
const revokeToken = vi.mocked(apiClient.revokeAuthorizedOAuthToken);
const revokeName = (name: string) => `settings.connectedApps.revoke: ${name}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  listTokens.mockReset().mockResolvedValue(tokens);
  revokeToken.mockReset().mockResolvedValue(undefined);
  globalThis.__setMockLanguage('en');
});

it('blocks every revoke until the refreshed list arrives and focuses the result', async () => {
  const revoke = deferred<void>();
  const refetch = deferred<Tokens>();
  listTokens.mockResolvedValueOnce(tokens).mockReturnValueOnce(refetch.promise);
  revokeToken.mockReturnValueOnce(revoke.promise);
  render(<ConnectedAppsSection />);
  const classroom = await screen.findByRole('button', { name: revokeName('Classroom') });
  const notes = screen.getByRole('button', { name: revokeName('Notes') });

  fireEvent.click(classroom);
  await waitFor(() => expect(classroom).toBeDisabled());
  expect(notes).toBeDisabled();
  expect(classroom).toHaveAttribute('aria-busy', 'true');
  expect(notes).toHaveAttribute('aria-busy', 'false');
  fireEvent.click(notes);
  expect(revokeToken).toHaveBeenCalledTimes(1);
  expect(revokeToken).toHaveBeenCalledWith('classroom');

  await act(async () => { revoke.resolve(); });
  await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
  expect(classroom).toBeDisabled();
  expect(classroom).toHaveAttribute('aria-busy', 'true');
  expect(notes).toBeDisabled();

  await act(async () => { refetch.resolve([tokens[1]]); });
  await waitFor(() => expect(screen.queryByText('Classroom')).not.toBeInTheDocument());
  await waitFor(() => expect(notes).toBeEnabled());
  expect(screen.getByText('settings.connectedApps.successRevoked').closest('[tabindex="-1"]')).toHaveFocus();
});

it('retains the app after failure, clears the error during retry, and handles the final removal', async () => {
  const retry = deferred<void>();
  listTokens.mockResolvedValueOnce([tokens[0]]).mockResolvedValueOnce([]);
  revokeToken.mockRejectedValueOnce(new Error('Revoke failed')).mockReturnValueOnce(retry.promise);
  render(<ConnectedAppsSection />);
  const button = await screen.findByRole('button', { name: revokeName('Classroom') });
  fireEvent.click(button);
  const error = await screen.findByText('settings.connectedApps.errorRevoking');
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByText('Classroom')).toBeInTheDocument();
  expect(error.closest('[tabindex="-1"]')).toHaveFocus();

  fireEvent.click(button);
  await waitFor(() => expect(button).toBeDisabled());
  expect(screen.queryByText('settings.connectedApps.errorRevoking')).not.toBeInTheDocument();
  await act(async () => { retry.resolve(); });
  expect(await screen.findByText('settings.connectedApps.empty')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('settings.connectedApps.successRevoked').closest('[tabindex="-1"]')).toHaveFocus());
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(revokeToken).toHaveBeenCalledTimes(2);
});

it.each(['ja', 'en'] as const)('formats issue and expiry dates with the selected %s locale', async (locale) => {
  globalThis.__setMockLanguage(locale);
  render(<ConnectedAppsSection />);
  expect(await screen.findByText(new Date(tokens[0].issued_at).toLocaleString(locale))).toBeInTheDocument();
  expect(screen.getByText(new Date(tokens[1].expires_at!).toLocaleString(locale))).toBeInTheDocument();
  expect(screen.getByText('settings.connectedApps.expiresNever')).toBeInTheDocument();
});
