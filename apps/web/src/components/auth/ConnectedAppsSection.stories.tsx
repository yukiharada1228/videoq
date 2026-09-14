import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { authFixtures } from '../../../.storybook/fixtures/auth';
import { consents, consentListPath, englishClientNames, longClientNames, longConsents, publicClientHandler, revokeConsentPath } from '../../../.storybook/fixtures/connectedApps';
import { failure, pending, restGet, restPost } from '../../../.storybook/mocks/network';
import { ConnectedAppsSection } from './ConnectedAppsSection';

interface AppFixture {
  consents?: typeof consents;
  names?: Record<string, string>;
  load?: 'pending' | 'error';
  revoke?: 'pending' | 'error' | 'retry';
  refetchPending?: boolean;
}
const revokeRequest = fn();
const successMessage = /連携を失効しました|Connection revoked/;
const errorMessage = /失効に失敗しました|Failed to revoke token/;

async function firstRevokeButton(canvasElement: HTMLElement) {
  const table = await within(canvasElement).findByRole('table');
  return within(within(table).getAllByRole('row')[1]).getByRole('button', { name: /失効|Revoke/ });
}

const meta = {
  title: 'Auth/ConnectedAppsSection',
  component: ConnectedAppsSection,
  parameters: { pathname: '/settings', api: { auth: authFixtures.user }, docs: { story: { inline: false, height: '640px' } } },
  decorators: [(Story) => <div className="mx-auto max-w-5xl p-2"><Story /></div>],
  beforeEach({ parameters, msw }) {
    const fixture: AppFixture = parameters.connectedApps ?? {};
    let rows = structuredClone(fixture.consents ?? consents);
    let attempts = 0;
    revokeRequest.mockClear();
    msw.use(
      fixture.load ? restGet(consentListPath, fixture.load === 'pending' ? pending() : failure())
        : http.get(consentListPath, () => HttpResponse.json(rows)),
      publicClientHandler(fixture.names),
      fixture.revoke === 'pending' ? restPost(revokeConsentPath, pending())
        : http.post(revokeConsentPath, async ({ request }) => {
          const body = await request.json() as { id: string };
          revokeRequest(body);
          attempts++;
          if (fixture.revoke === 'error' || (fixture.revoke === 'retry' && attempts === 1)) {
            return HttpResponse.json({ message: 'Fixture revoke failed', code: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
          }
          rows = rows.filter((row) => row.id !== body.id);
          if (fixture.refetchPending) msw.use(restGet(consentListPath, pending()));
          return HttpResponse.json({ success: true });
        }),
    );
  },
  async play({ canvasElement }) {
    await expect(await within(canvasElement).findByRole('table')).toBeVisible();
  },
} satisfies Meta<typeof ConnectedAppsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleApps: Story = {
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    const table = await canvas.findByRole('table');
    await expect(within(table).getAllByRole('row')).toHaveLength(3);
    await expect(canvas.getByText('授業サポート')).toBeVisible();
    // Better Auth consents currently have no expiry; the adapter maps them to null.
    await expect(within(table).getAllByRole('cell', { name: '—' })).toHaveLength(2);
  },
};
export const Empty: Story = {
  parameters: { connectedApps: { consents: [] } satisfies AppFixture },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/現在連携中のアプリはありません。|No apps are currently connected./)).toBeVisible();
    await expect(canvas.queryByRole('table')).not.toBeInTheDocument();
  },
};
export const Loading: Story = {
  parameters: { connectedApps: { load: 'pending' } satisfies AppFixture },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('progressbar')).toBeVisible();
    await expect(canvas.queryByRole('table')).not.toBeInTheDocument();
  },
};
export const LoadFailed: Story = {
  parameters: { connectedApps: { load: 'error' } satisfies AppFixture },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/連携アプリの読み込みに失敗しました|Failed to load connected apps/)).toBeVisible();
    await expect(canvas.queryByRole('table')).not.toBeInTheDocument();
  },
};
export const LongContent: Story = { parameters: { connectedApps: { consents: longConsents, names: longClientNames } satisfies AppFixture } };
export const LongContentMobile: Story = {
  ...LongContent,
  globals: { viewport: { value: 'mobile', isRotated: false } },
  async play({ canvasElement }) {
    const table = await within(canvasElement).findByRole('table');
    const scroller = table.parentElement!;
    scroller.scrollLeft = scroller.scrollWidth;
    await waitFor(() => expect(scroller.scrollLeft).toBeGreaterThan(0));
  },
};
export const EnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  parameters: { connectedApps: { names: englishClientNames } satisfies AppFixture },
  async play({ canvasElement }) {
    await expect(await within(canvasElement).findByText('Classroom assistant')).toBeVisible();
  },
};
export const RevokePending: Story = {
  parameters: { connectedApps: { revoke: 'pending' } satisfies AppFixture },
  async play({ canvasElement, userEvent }) {
    const button = await firstRevokeButton(canvasElement);
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    for (const action of within(canvasElement).getAllByRole('button')) await expect(action).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(within(canvasElement).getAllByRole('row')).toHaveLength(3);
  },
};
export const RefetchPending: Story = {
  parameters: { connectedApps: { refetchPending: true } satisfies AppFixture },
  async play({ canvasElement, userEvent }) {
    const button = await firstRevokeButton(canvasElement);
    await userEvent.click(button);
    await expect(await within(canvasElement).findByText(successMessage)).toBeVisible();
    for (const action of within(canvasElement).getAllByRole('button')) await expect(action).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
  },
};
export const RevokeFailed: Story = {
  parameters: { connectedApps: { revoke: 'error' } satisfies AppFixture },
  async play({ canvasElement, userEvent }) {
    const button = await firstRevokeButton(canvasElement);
    await userEvent.click(button);
    await expect(await within(canvasElement).findByText(errorMessage)).toBeVisible();
    await waitFor(() => expect(button).toBeEnabled());
    await expect(within(canvasElement).getAllByRole('row')).toHaveLength(3);
  },
};
export const RevokeSucceeded: Story = {
  async play({ canvasElement, userEvent }) {
    await userEvent.click(await firstRevokeButton(canvasElement));
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(successMessage)).toBeVisible();
    await waitFor(() => expect(canvas.queryByText('授業サポート')).not.toBeInTheDocument());
    await expect(canvas.getByText('学習ノート')).toBeVisible();
    await expect(revokeRequest).toHaveBeenCalledTimes(1);
    await expect(revokeRequest).toHaveBeenCalledWith({ id: consents[0].id });
  },
};
export const FailureThenRetry: Story = {
  parameters: { connectedApps: { revoke: 'retry' } satisfies AppFixture },
  async play({ canvasElement, userEvent }) {
    const button = await firstRevokeButton(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(button);
    await expect(await canvas.findByText(errorMessage)).toBeVisible();
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await expect(await canvas.findByText(successMessage)).toBeVisible();
    await waitFor(() => expect(canvas.queryByText('授業サポート')).not.toBeInTheDocument());
    await expect(revokeRequest).toHaveBeenCalledTimes(2);
  },
};
export const KeyboardRevokeLastApp: Story = {
  parameters: { connectedApps: { consents: [consents[0]] } satisfies AppFixture },
  async play({ canvasElement, userEvent }) {
    const button = await firstRevokeButton(canvasElement);
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/現在連携中のアプリはありません。|No apps are currently connected./)).toBeVisible();
    await expect(canvas.getByText(successMessage).closest('[tabindex="-1"]')).toHaveFocus();
  },
};
