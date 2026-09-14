import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http, HttpResponse } from 'msw';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { API_URL, apiClient } from './api';
import { fetchAuthSession } from './authSession';
import { appQueryClient } from './queryClient';
import { createAppTrpcClient, trpc } from './trpc';
import { authFixtures } from '../../.storybook/fixtures/auth';
import { apiKeysResponse, emptyTagPage, tagPage } from '../../.storybook/fixtures/api';
import { englishTags, longTag } from '../../.storybook/fixtures/tags';
import { failure, pending, restGet, success, trpcMutation, trpcQuery } from '../../.storybook/mocks/network';

const listInput = { limit: 100, offset: 0 };
const createdTag = { ...tagPage.data[0], id: 99, name: '追加したタグ' };

// A small connected example; hooks, transports, error mapping, and cache updates are real.
function ApiExample() {
  const { i18n } = useTranslation();
  const en = i18n.language === 'en';
  const { user, isLoading } = useAuth({ redirectToLogin: false });
  const client = useQueryClient();
  const tags = useQuery(trpc.tags.list.queryOptions(listInput));
  const keys = useQuery({ queryKey: ['storybook', 'apiKeys'], queryFn: () => apiClient.getIntegrationApiKeys() });
  const create = useMutation(trpc.tags.create.mutationOptions({
    onSuccess(tag) {
      client.setQueryData(trpc.tags.list.queryKey(listInput), (previous) => ({
        data: [...(previous?.data ?? []), tag],
        meta: { ...listInput, total: (previous?.meta.total ?? 0) + 1 },
      }));
    },
  }));
  const waiting = tags.isFetching || keys.isFetching || create.isPending;
  return (
    <main className="mx-auto max-w-xl space-y-5 rounded-xl border border-gray-200 bg-white p-5 text-gray-900">
      <h1 className="text-xl font-bold">{en ? 'Learning workspace' : '学習ワークスペース'}</h1>
      <section aria-label={en ? 'Account' : 'アカウント'} className="break-words">
        {isLoading ? <p role="status">{en ? 'Checking account…' : 'アカウントを確認中…'}</p>
          : user ? <p>{user.username} · {user.is_superuser ? (en ? 'Administrator' : '管理者') : (en ? 'Member' : '一般ユーザー')}</p>
            : <p>{en ? 'Signed out' : '未ログイン'}</p>}
      </section>
      <section aria-label={en ? 'Tags' : 'タグ'} className="space-y-2">
        <h2 className="font-semibold">{en ? 'Tags' : 'タグ'}</h2>
        {tags.isPending ? <p role="status">{en ? 'Loading tags…' : 'タグを読み込み中…'}</p>
          : tags.error ? <p role="alert" className="text-red-700">{tags.error.message}</p>
            : tags.data.data.length ? <ul className="space-y-1 break-words">{tags.data.data.map((tag) => <li key={tag.id}>{tag.name}</li>)}</ul>
              : <p>{en ? 'No tags yet' : 'タグはまだありません'}</p>}
      </section>
      <section aria-label={en ? 'Integrations' : '連携'} className="space-y-2">
        <h2 className="font-semibold">{en ? 'Integrations' : '連携'}</h2>
        {keys.isPending ? <p role="status">{en ? 'Loading integrations…' : '連携を読み込み中…'}</p>
          : keys.error ? <p role="alert" className="text-red-700">{keys.error.message}</p>
            : keys.data.length ? <ul className="break-words">{keys.data.map((key) => <li key={key.id}>{key.name}</li>)}</ul>
              : <p>{en ? 'No integrations yet' : '連携はまだありません'}</p>}
      </section>
      {create.error && <p role="alert" className="text-red-700">{create.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={waiting} onClick={() => { void tags.refetch(); void keys.refetch(); }}>{en ? 'Refresh' : '再読み込み'}</Button>
        <Button disabled={waiting || !user} onClick={() => create.mutate({ name: createdTag.name, color: 'blue' })}>{en ? 'Add tag' : 'タグを追加'}</Button>
      </div>
    </main>
  );
}

const defaultApi = {
  auth: authFixtures.user,
  trpc: [trpcQuery('tags.list', success(tagPage)), trpcMutation('tags.create', success(createdTag))],
  rest: [restGet('/api/auth/api-key/list', success(apiKeysResponse))],
};

const meta = {
  title: 'Foundation/ApiMocks',
  component: ApiExample,
  parameters: {
    pathname: '/videos',
    api: defaultApi,
    // The app's singleton transport/cache requires one connected story per iframe.
    docs: { story: { inline: false, height: '520px' } },
  },
  async play({ canvasElement, globals }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(globals.locale === 'en' ? 'Tags' : 'タグ', { selector: 'h2' })).toBeVisible();
  },
} satisfies Meta<typeof ApiExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/山田 太郎 · (一般ユーザー|Member)/)).toBeVisible();
    await expect(await canvas.findByText('線形代数')).toBeVisible();
    await expect(await canvas.findByText('授業資料の連携')).toBeVisible();
    await expect(appQueryClient.getQueryData(trpc.tags.list.queryKey(listInput))).toEqual(tagPage);
    await expect(await appQueryClient.fetchQuery(trpc.account.me.queryOptions())).toEqual(authFixtures.user.profile);
    await expect((await fetchAuthSession()).data?.user.id).toBe(authFixtures.user.profile?.id);
  },
};
export const Administrator: Story = {
  parameters: { api: { ...defaultApi, auth: authFixtures.admin } },
  async play({ canvasElement }) { await expect(await within(canvasElement).findByText(/管理者 · (管理者|Administrator)/)).toBeVisible(); },
};
export const LoggedOut: Story = {
  parameters: { api: { ...defaultApi, auth: authFixtures.loggedOut } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/未ログイン|Signed out/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: /タグを追加|Add tag/ })).toBeDisabled();
    await expect((await fetchAuthSession()).data).toBeNull();
    await expect(appQueryClient.getQueryData(trpc.account.me.queryKey())).toBeUndefined();
    const onUnauthorized = fn();
    const client = createAppTrpcClient({ onUnauthorized });
    await expect(client.account.me.query()).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED', httpStatus: 401 } });
    await expect(onUnauthorized).toHaveBeenCalledTimes(1);
  },
};
export const Empty: Story = {
  parameters: { api: { ...defaultApi, trpc: [trpcQuery('tags.list', success(emptyTagPage)), defaultApi.trpc[1]], rest: [restGet('/api/auth/api-key/list', success({ apiKeys: [] }))] } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/タグはまだありません|No tags yet/)).toBeVisible();
    await expect(await canvas.findByText(/連携はまだありません|No integrations yet/)).toBeVisible();
  },
};
export const Loading: Story = {
  parameters: { api: { ...defaultApi, trpc: [trpcQuery('tags.list', pending())], rest: [restGet('/api/auth/api-key/list', pending())] } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/タグを読み込み中…|Loading tags…/)).toBeVisible();
    await expect(await canvas.findByText(/連携を読み込み中…|Loading integrations…/)).toBeVisible();
    for (const button of canvas.getAllByRole('button')) await expect(button).toBeDisabled();
  },
};
export const Failed: Story = {
  parameters: { api: { ...defaultApi, trpc: [trpcQuery('tags.list', failure('タグを取得できませんでした'))], rest: [restGet('/api/auth/api-key/list', failure('連携を取得できませんでした'))] } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('タグを取得できませんでした')).toHaveAttribute('role', 'alert');
    await expect(await canvas.findByText('連携を取得できませんでした')).toHaveAttribute('role', 'alert');
    await expect(canvas.getByRole('button', { name: /再読み込み|Refresh/ })).toBeEnabled();
  },
};
export const KeyboardMutation: Story = {
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    const add = canvas.getByRole('button', { name: /タグを追加|Add tag/ });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: /再読み込み|Refresh/ })).toHaveFocus();
    await userEvent.tab();
    await expect(add).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(await canvas.findByText(createdTag.name)).toBeVisible();
    await expect(appQueryClient.getQueryData(trpc.tags.list.queryKey(listInput))).toMatchObject({ meta: { total: 4 } });
  },
};
export const MutationPending: Story = {
  parameters: { api: { ...defaultApi, trpc: [defaultApi.trpc[0], trpcMutation('tags.create', pending())] } },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    const add = canvas.getByRole('button', { name: /タグを追加|Add tag/ });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    await waitFor(() => expect(add).toBeDisabled());
    await expect(canvas.getByRole('button', { name: /再読み込み|Refresh/ })).toBeDisabled();
  },
};
export const MutationFailed: Story = {
  parameters: { api: { ...defaultApi, trpc: [defaultApi.trpc[0], trpcMutation('tags.create', failure('タグを作成できませんでした', 403))] } },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    const add = canvas.getByRole('button', { name: /タグを追加|Add tag/ });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('タグを作成できませんでした');
    await expect(add).toBeEnabled();
    await expect(appQueryClient.getQueryData(trpc.tags.list.queryKey(listInput))).toEqual(tagPage);
  },
};
export const RestFailureThenRetry: Story = {
  beforeEach({ msw }) {
    let attempts = 0;
    msw.use(http.get('/api/auth/api-key/list', () => ++attempts === 1
      ? HttpResponse.json({ message: '再読み込みしてください', code: 'INTERNAL_SERVER_ERROR' }, { status: 500 })
      : HttpResponse.json(apiKeysResponse)));
  },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('再読み込みしてください');
    await userEvent.click(canvas.getByRole('button', { name: /再読み込み|Refresh/ }));
    await expect(await canvas.findByText('授業資料の連携')).toBeVisible();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
export const RestMutation: Story = {
  beforeEach({ msw }) {
    msw.use(http.post('/api/auth/api-key/create', async ({ request }) => {
      const body = await request.json();
      await expect(body).toMatchObject({ name: 'Sample key', metadata: { accessLevel: 'read_only' } });
      return HttpResponse.json({ ...apiKeysResponse.apiKeys[0], name: 'Sample key', key: 'storybook-key-not-valid' });
    }));
  },
  async play() {
    await expect(await apiClient.createIntegrationApiKey({ name: 'Sample key', access_level: 'read_only' }))
      .toMatchObject({ name: 'Sample key', access_level: 'read_only', api_key: 'storybook-key-not-valid' });
  },
};
export const MixedBatchAndInputs: Story = {
  async beforeEach({ msw }) {
    // Installed per run; function-local state never survives a story remount.
    const { trpcHandler } = await import('../../.storybook/mocks/network');
    msw.use(trpcHandler([
      trpcQuery('billing.plans', success([])),
      trpcQuery('videos.statusCounts', failure('Access denied', 403)),
      trpcQuery('tags.list', (input) => success({ ...tagPage, meta: { ...tagPage.meta, ...input } })),
      trpcQuery('account.me', success(authFixtures.user.profile!)),
      trpcMutation('tags.create', (input) => success({ ...createdTag, ...input })),
    ]));
  },
  async play() {
    const client = createAppTrpcClient({ onUnauthorized: fn() });
    const results = await Promise.allSettled([
      client.billing.plans.query(), client.videos.statusCounts.query(),
      client.tags.list.query({ limit: 7, offset: 3 }),
    ]);
    await expect(results[0]).toEqual({ status: 'fulfilled', value: [] });
    await expect(results[1]).toMatchObject({ status: 'rejected', reason: { data: { code: 'FORBIDDEN', httpStatus: 403 } } });
    await expect(results[2]).toMatchObject({ status: 'fulfilled', value: { meta: { limit: 7, offset: 3 } } });
    const created = await Promise.all(['First', 'Second'].map((name) => client.tags.create.mutate({ name, color: 'blue' })));
    await expect(created.map((tag) => tag.name)).toEqual(['First', 'Second']);
  },
};
export const UnmockedRequestsBlocked: Story = {
  async play() {
    await expect(API_URL).toBe('/api');
    // Deliberately undefined paths: MSW must reject these before any server handles them.
    await expect(fetch('/api/__storybook_unhandled__')).rejects.toThrow();
    await expect(fetch('/api/__storybook_unhandled__', { method: 'POST' })).rejects.toThrow();
    await expect(fetch('https://example.invalid/storybook-asset.svg')).rejects.toThrow();
    const response = await fetch('/api/trpc/storybook.undefined?batch=1&input=%7B%7D');
    await expect(response.status).toBe(500);
    await expect(await response.json()).toEqual([expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('Undefined tRPC procedure') }) })]);
  },
};
export const EnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  parameters: { api: { ...defaultApi, auth: authFixtures.english, trpc: [trpcQuery('tags.list', success({ ...tagPage, data: englishTags })), defaultApi.trpc[1]], rest: [restGet('/api/auth/api-key/list', success({ apiKeys: [{ ...apiKeysResponse.apiKeys[0], name: 'Course materials' }] }))] } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Alex Morgan · Member')).toBeVisible();
    await expect(await canvas.findByText('Linear algebra')).toBeVisible();
    await expect(await canvas.findByText('Course materials')).toBeVisible();
  },
};
export const LongContentMobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { api: { ...defaultApi, auth: authFixtures.longName, trpc: [trpcQuery('tags.list', success({ ...tagPage, data: [longTag], meta: { ...tagPage.meta, total: 1 } })), defaultApi.trpc[1]] } },
  async play({ canvasElement }) { await expect(await within(canvasElement).findByText(longTag.name)).toBeVisible(); },
};
