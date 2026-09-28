import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, type AuthorizedOAuthToken } from '@/lib/api';
import { trpc } from '@/lib/trpc';
import { ConnectedAppsSection } from '../ConnectedAppsSection';

type Tokens = AuthorizedOAuthToken[];
const tokens: Tokens = [
  { id: 'classroom', client_id: 'classroom', client_name: 'Classroom', scope: 'video:read', issued_at: '2026-09-01T09:00:00Z' },
  { id: 'notes', client_id: 'notes', client_name: 'Notes', scope: '', issued_at: '2026-09-02T09:00:00Z' },
];
const listTokens = vi.fn<() => Promise<Tokens>>();
const revokeToken = vi.mocked(apiClient.revokeAuthorizedOAuthToken);
const revokeName = (name: string) => `settings.connectedApps.revoke: ${name}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  listTokens.mockReset().mockResolvedValue(tokens);
  globalThis.__setTrpcHandler('account.connectedApps', listTokens);
  revokeToken.mockReset().mockResolvedValue(undefined);
  globalThis.__setMockLanguage('en');
});

it('blocks every revoke until it succeeds, then removes the app without fetching the list again', async () => {
  const revoke = deferred<void>();
  listTokens.mockResolvedValueOnce(tokens).mockRejectedValueOnce(new Error('List unavailable'));
  revokeToken.mockReturnValueOnce(revoke.promise);
  render(<ConnectedAppsSection />);
  const classroom = await screen.findByRole('button', { name: revokeName('Classroom') });
  const notes = screen.getByRole('button', { name: revokeName('Notes') });

  fireEvent.click(classroom);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.connectedApps.revoke' }));
  await waitFor(() => expect(classroom).toBeDisabled());
  expect(notes).toBeDisabled();
  expect(classroom).toHaveAttribute('aria-busy', 'true');
  expect(notes).toHaveAttribute('aria-busy', 'false');
  fireEvent.click(notes);
  expect(revokeToken).toHaveBeenCalledTimes(1);
  expect(revokeToken).toHaveBeenCalledWith('classroom');

  await act(async () => { revoke.resolve(); });
  await waitFor(() => expect(screen.queryByText('Classroom')).not.toBeInTheDocument());
  await waitFor(() => expect(notes).toBeEnabled());
  expect(screen.getByText('settings.connectedApps.successRevoked').closest('[tabindex="-1"]')).toHaveFocus();
  expect(listTokens).toHaveBeenCalledTimes(1);
});

it('keeps a disconnected app removed after an older list request resolves', async () => {
  const pending = deferred<Tokens>();
  listTokens.mockResolvedValueOnce(tokens).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useQueryClient());
  render(<ConnectedAppsSection />);
  fireEvent.click(await screen.findByRole('button', { name: revokeName('Classroom') }));
  let fetching!: Promise<void>;
  act(() => { fetching = result.current.refetchQueries({ queryKey: trpc.account.connectedApps.queryKey() }); });
  await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.connectedApps.revoke' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await act(async () => { pending.resolve(tokens); await fetching; });
  expect(result.current.getQueryData(trpc.account.connectedApps.queryKey())).toEqual([tokens[1]]);
  expect(screen.queryByText('Classroom')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: revokeName('Notes') })).toBeEnabled();
  expect(listTokens).toHaveBeenCalledTimes(2);
});

it.each([false, true])('removes all grants for the disconnected client (pending list: %s)', async (refetch) => {
  const grants = [
    tokens[0],
    { ...tokens[0], id: 'classroom-write', scope: 'videoq.write' },
    // A display name is not a client identity.
    { ...tokens[1], client_name: 'Classroom' },
  ];
  const pending = deferred<Tokens>();
  listTokens.mockResolvedValueOnce(grants).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useQueryClient());
  render(<ConnectedAppsSection />);
  const buttons = await screen.findAllByRole('button', { name: revokeName('Classroom') });
  fireEvent.click(buttons[0]);

  let fetching: Promise<void> | undefined;
  if (refetch) {
    act(() => { fetching = result.current.refetchQueries({ queryKey: trpc.account.connectedApps.queryKey() }); });
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
  }
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.connectedApps.revoke' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  if (refetch) await act(async () => { pending.resolve(grants); await fetching; });

  expect(result.current.getQueryData(trpc.account.connectedApps.queryKey())).toEqual([grants[2]]);
  expect(screen.getAllByRole('button', { name: revokeName('Classroom') })).toHaveLength(1);
  expect(revokeToken).toHaveBeenCalledExactlyOnceWith('classroom');
  expect(listTokens).toHaveBeenCalledTimes(refetch ? 2 : 1);
});

it('retains every grant when disconnecting a client fails', async () => {
  const grants = [tokens[0], { ...tokens[0], id: 'classroom-write', scope: 'videoq.write' }, tokens[1]];
  listTokens.mockResolvedValueOnce(grants);
  revokeToken.mockRejectedValueOnce(new Error('Revoke failed'));
  const { result } = renderHook(() => useQueryClient());
  render(<ConnectedAppsSection />);
  fireEvent.click((await screen.findAllByRole('button', { name: revokeName('Classroom') }))[0]);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.connectedApps.revoke' }));
  await screen.findByText('settings.connectedApps.errorRevoking');

  expect(result.current.getQueryData(trpc.account.connectedApps.queryKey())).toEqual(grants);
  expect(screen.getAllByRole('button', { name: revokeName('Classroom') })).toHaveLength(2);
  expect(screen.getByRole('button', { name: revokeName('Notes') })).toBeEnabled();
  expect(listTokens).toHaveBeenCalledTimes(1);
});

it('retains the app after failure, clears the error during retry, and handles the final removal', async () => {
  const retry = deferred<void>();
  listTokens.mockResolvedValue([tokens[0]]);
  revokeToken.mockRejectedValueOnce(new Error('Revoke failed')).mockReturnValueOnce(retry.promise);
  render(<ConnectedAppsSection />);
  const button = await screen.findByRole('button', { name: revokeName('Classroom') });
  fireEvent.click(button);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.connectedApps.revoke' }));
  const error = await screen.findByText('settings.connectedApps.errorRevoking');
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByText('Classroom')).toBeInTheDocument();
  expect(error.closest('[tabindex="-1"]')).toHaveFocus();

  fireEvent.click(button);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.connectedApps.revoke' }));
  await waitFor(() => expect(button).toBeDisabled());
  expect(screen.queryByText('settings.connectedApps.errorRevoking')).not.toBeInTheDocument();
  await act(async () => { retry.resolve(); });
  expect(await screen.findByText('settings.connectedApps.empty')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('settings.connectedApps.successRevoked').closest('[tabindex="-1"]')).toHaveFocus());
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(revokeToken).toHaveBeenCalledTimes(2);
  expect(listTokens).toHaveBeenCalledTimes(1);
});

it.each(['ja', 'en'] as const)('formats issue dates with the selected %s locale', async (locale) => {
  globalThis.__setMockLanguage(locale);
  render(<ConnectedAppsSection />);
  expect(await screen.findByText(new Date(tokens[0].issued_at!).toLocaleString(locale))).toBeInTheDocument();
  expect(screen.getByText(new Date(tokens[1].issued_at!).toLocaleString(locale))).toBeInTheDocument();
});


it('does not disconnect when confirmation is cancelled', async () => {
  render(<ConnectedAppsSection />);
  const button = await screen.findByRole('button', { name: revokeName('Classroom') });
  fireEvent.click(button);
  expect(revokeToken).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Classroom')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'settings.cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(revokeToken).not.toHaveBeenCalled();
  expect(screen.getByText('Classroom')).toBeInTheDocument();
});

it('shows an unknown issue date without inventing a timestamp', async () => {
  listTokens.mockResolvedValueOnce([{ ...tokens[0], issued_at: null }]);
  render(<ConnectedAppsSection />);
  await screen.findByText('Classroom');
  expect(screen.getByText('—')).toBeInTheDocument();
  expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
});
