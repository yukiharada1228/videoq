import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { AdminUser } from '@/lib/api';
import i18n from '@/i18n/config';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';
import AdminPage from './AdminPage';
import { authFixtures } from '../../.storybook/fixtures/auth';
import { failure, pending, success, trpcMutation, trpcQuery } from '../../.storybook/mocks/network';

const bob: AdminUser = {
  id: 'bob', username: 'Bob', email: 'bob@example.test', is_active: true,
  is_admin: false, max_video_upload_size_mb: 200,
  storage_limit_gb: 1, processing_limit_minutes: 45, ai_answers_limit: 30,
  used_storage_bytes: 0, used_processing_seconds: 0, used_ai_answers: 0,
  usage_period_start: null, is_over_quota: false, plan_code: 'free', quota_source: 'plan',
};
const alice = { ...bob, id: 'alice', username: 'Alice', email: 'alice@example.test' };
const deleteRequest = fn();
const listRequest = fn();
const quotaRequest = fn();
const flagsRequest = fn();
let editedUser = bob;

const meta = {
  title: 'Pages/Admin',
  component: AdminPage,
  decorators: [(Story) => <main className={`mx-auto w-full pb-16 pt-8 ${APP_CONTAINER_CLASS}`}><Story /></main>],
  parameters: { layout: 'fullscreen', pathname: '/admin', api: { auth: authFixtures.admin, trpc: [
    trpcQuery('admin.listUsers', input => {
      listRequest(input);
      return success({ data: input?.q === 'Alice' ? [alice] : [editedUser],
        meta: { total: input?.q === 'Alice' ? 21 : 1, offset: input?.offset ?? 0, limit: 20 } });
    }),
    trpcMutation('admin.deleteUser', input => {
      deleteRequest(input);
      return success({ job_id: 'deletion-fixture' });
    }),
    trpcMutation('admin.patchQuota', input => {
      quotaRequest(input);
      editedUser = { ...editedUser, ...input, quota_source: 'admin' };
      return success(editedUser);
    }),
    trpcMutation('admin.patchFlags', input => {
      flagsRequest(input);
      editedUser = { ...editedUser, ...input };
      return success(editedUser);
    }),
  ] } },
  beforeEach() {
    deleteRequest.mockClear(); listRequest.mockClear();
    quotaRequest.mockClear(); flagsRequest.mockClear(); editedUser = bob;
  },
} satisfies Meta<typeof AdminPage>;
export default meta;
type Story = StoryObj<typeof meta>;

const directoryUsers: AdminUser[] = [
  {
    ...bob, id: '82c71a50-692a-47ad-b4cb-fc60259db781', username: '山田 太郎',
    email: 'taro.yamada@example.test', is_admin: true,
    max_video_upload_size_mb: 2000, storage_limit_gb: null,
  },
  {
    ...bob, id: 'a48fdb86-456f-42c2-9a65-1424dfb685e2', username: '佐藤 花子',
    email: 'hanako.sato@example.test', max_video_upload_size_mb: 500, storage_limit_gb: 10,
  },
  {
    ...bob, id: 'f9ea708c-2930-4272-a479-96ea528d1ed7',
    username: 'international.education.content.operations',
    email: 'international.education.content.operations@learning.example.test',
    is_active: false, is_over_quota: true,
  },
  {
    ...bob, id: '4d7cdf95-6f25-45ee-a4ce-a08d318dea11', is_over_quota: true,
    max_video_upload_size_mb: 2_147_483_647, storage_limit_gb: 123.45678901234567,
  },
];
let directoryState: AdminUser[] = [];

function updateDirectoryUser(patch: Partial<AdminUser> & { id: string }) {
  const user = directoryState.find(user => user.id === patch.id);
  if (!user) return failure('User not found', 404);
  const updated = { ...user, ...patch };
  directoryState = directoryState.map(user => user.id === patch.id ? updated : user);
  return success(updated);
}

async function expectDirectoryLayout(canvasElement: HTMLElement, allowWrappedChips = false) {
  const canvas = within(canvasElement);
  await canvas.findByText(directoryUsers[0].username);
  const table = canvas.getByRole('table', { name: i18n.t('admin.users.title') });
  await expect(table.scrollWidth).toBeLessThanOrEqual(table.clientWidth);
  await expect(table.getBoundingClientRect().right).toBeLessThanOrEqual(table.parentElement!.getBoundingClientRect().right);
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  for (const user of directoryUsers) {
    const row = within(canvas.getByText(user.username).closest('tr')!);
    await expect(row.getByText(user.email)).toBeVisible();
    await expect(row.getByText(user.id)).toBeVisible();
    for (const action of ['edit', 'delete']) {
      await expect(row.getByRole('button', { name: i18n.t(`admin.users.${action}`) }))
        .toHaveAccessibleDescription(`${user.username} ${user.email}`);
    }
    for (const cell of [row.getByRole('rowheader'), ...row.getAllByRole('cell')]) {
      await expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth);
    }
  }
  for (const chip of table.querySelectorAll('[data-slot="chip-label"]')) {
    const text = document.createRange();
    text.selectNodeContents(chip);
    if (!allowWrappedChips) await expect(text.getClientRects()).toHaveLength(1);
    await expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth);
  }
}

export const UserDirectory: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  beforeEach() { directoryState = structuredClone(directoryUsers); },
  parameters: { api: { trpc: [
    trpcQuery('admin.listUsers', input => {
      const { q = '', offset = 0, limit = 20 } = input ?? {};
      const users = directoryState.filter(user => `${user.username} ${user.email}`.toLowerCase().includes(q.toLowerCase()));
      return success({ data: users.slice(offset, offset + limit), meta: { total: users.length, offset, limit } });
    }),
    trpcMutation('admin.patchQuota', input => updateDirectoryUser({ ...input, quota_source: 'admin' })),
    trpcMutation('admin.patchFlags', updateDirectoryUser),
    trpcMutation('admin.patchUsage', updateDirectoryUser),
    trpcMutation('admin.deleteUser', input => {
      updateDirectoryUser({ ...input, is_active: false });
      return success({ job_id: 'deletion-directory-fixture' });
    }),
    trpcMutation('admin.reindexAll', success({ job_id: 'reindex-directory-fixture' })),
  ] } },
  async play({ canvasElement }) { await expectDirectoryLayout(canvasElement); },
};
export const UserDirectoryMobile: Story = {
  ...UserDirectory, globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const UserDirectoryEnglish: Story = {
  ...UserDirectory, globals: { ...UserDirectory.globals, locale: 'en' },
};
export const UserDirectoryEnglishMobile: Story = {
  ...UserDirectory, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
export const UserDirectoryEnlargedText: Story = {
  ...UserDirectory,
  globals: { locale: 'en', viewport: { value: 'tablet', isRotated: false } },
  beforeEach() {
    directoryState = structuredClone(directoryUsers);
    const root = document.documentElement;
    const fontSize = root.style.fontSize;
    root.style.fontSize = '32px';
    return () => { root.style.fontSize = fontSize; };
  },
};
export const UserDirectoryEnlargedMobile: Story = {
  ...UserDirectoryEnlargedText,
  globals: { locale: 'ja', viewport: { value: 'narrow', isRotated: false } },
  parameters: {
    ...UserDirectory.parameters,
    viewport: { options: {
      narrow: { name: 'Narrow mobile (320px)', styles: { width: '320px', height: '844px' }, type: 'mobile' },
    } },
  },
  async play({ canvasElement }) {
    await expect(window.innerWidth).toBe(320);
    await expectDirectoryLayout(canvasElement, true);
  },
};

export const EditUserLayout: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  async play({ canvas, userEvent }) {
    await userEvent.click(await canvas.findByRole('button', { name: i18n.t('admin.users.edit') }));
    const element = await within(document.body).findByRole('dialog');
    const dialog = within(element);
    const inputs = dialog.getAllByRole('textbox');
    for (const input of inputs) {
      const label = element.querySelector(`label[for="${input.id}"]`)!;
      const inputBounds = input.getBoundingClientRect();
      const labelBounds = label.getBoundingClientRect();
      await expect(inputBounds.top).toBeGreaterThanOrEqual(labelBounds.bottom);
      await expect(inputBounds.left).toBeCloseTo(labelBounds.left, 0);
      await expect(inputBounds.width).toBeCloseTo(input.parentElement!.getBoundingClientRect().width, 0);
    }
    for (const field of ['storageLimitGb', 'processingLimitMinutes', 'aiAnswersLimit']) {
      await expect(dialog.getByLabelText(i18n.t(`admin.users.fields.${field}`)))
        .toHaveAccessibleDescription(i18n.t('admin.users.nullableHint'));
    }
    await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
    await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.cancel') }));
    await expect(canvas.getByRole('button', { name: i18n.t('admin.users.edit') })).toHaveFocus();
  },
};
export const EditUserLayoutEnglishMobile: Story = {
  ...EditUserLayout, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
export const EditUserLayoutEnlargedMobile: Story = {
  ...EditUserLayout, globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
  beforeEach() {
    const root = document.documentElement;
    const fontSize = root.style.fontSize;
    root.style.fontSize = '32px';
    return () => { root.style.fontSize = fontSize; };
  },
};

export const SavingUser: Story = {
  parameters: { api: { trpc: [
    trpcQuery('admin.listUsers', success({ data: [bob], meta: { total: 1, offset: 0, limit: 20 } })),
    trpcMutation('admin.patchFlags', pending()),
  ] } },
  async play({ canvas, userEvent }) {
    await userEvent.click(await canvas.findByRole('button', { name: i18n.t('admin.users.edit') }));
    const body = within(document.body);
    const dialog = within(await body.findByRole('dialog'));
    await userEvent.click(dialog.getByLabelText(i18n.t('admin.users.fields.isAdmin')));
    await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.save') }));
    await expect(dialog.getByRole('button', { name: i18n.t('admin.users.save') })).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.getByRole('button', { name: i18n.t('admin.users.save') })).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.getByRole('button', { name: i18n.t('admin.users.cancel') })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: i18n.t('admin.users.save') })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(body.getByRole('dialog')).toBeVisible();
  },
};
export const SavingUserEnglishMobile: Story = {
  ...SavingUser, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const FailedSaveEnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  parameters: { api: { trpc: [
    trpcQuery('admin.listUsers', success({ data: [bob], meta: { total: 1, offset: 0, limit: 20 } })),
    trpcMutation('admin.patchFlags', failure('Permissions could not be updated.')),
  ] } },
  async play({ canvas, userEvent }) {
    await userEvent.click(await canvas.findByRole('button', { name: i18n.t('admin.users.edit') }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await userEvent.click(dialog.getByLabelText(i18n.t('admin.users.fields.isAdmin')));
    await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.save') }));
    const error = await dialog.findByRole('alert');
    await expect(error).toHaveTextContent('Permissions could not be updated.');
    await expect(error.parentElement).toHaveFocus();
    await expect(dialog.getByLabelText(i18n.t('admin.users.fields.isAdmin'))).toBeChecked();
    await expect(dialog.getByRole('button', { name: i18n.t('admin.users.cancel') })).toBeEnabled();
  },
};

export const InvalidQuotaThenSave: Story = {
  async play({ canvas, userEvent }) {
    await canvas.findByText('Bob');
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('admin.users.edit') }));
    const body = within(document.body);
    const dialog = within(await body.findByRole('dialog'));
    await userEvent.click(dialog.getByLabelText(i18n.t('admin.users.fields.isAdmin')));
    const processing = dialog.getByLabelText(i18n.t('admin.users.fields.processingLimitMinutes'));
    await userEvent.clear(processing);
    await userEvent.type(processing, '1.5');
    await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.save') }));
    await expect(await dialog.findByText(i18n.t('admin.users.errors.invalidProcessingMinutes'))).toBeVisible();
    await expect(processing).toHaveValue('1.5');
    await expect(processing).toHaveAttribute('aria-invalid', 'true');
    await expect(processing).toHaveAccessibleDescription(i18n.t('admin.users.errors.invalidProcessingMinutes'));
    await expect(processing).toHaveFocus();
    await expect(flagsRequest).not.toHaveBeenCalled();
    await expect(quotaRequest).not.toHaveBeenCalled();

    await userEvent.clear(processing);
    await userEvent.type(processing, '0');
    await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.save') }));
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(await canvas.findByText(i18n.t('admin.users.saveSuccess'))).toBeVisible();
    await expect(canvas.getByRole('button', { name: i18n.t('admin.users.edit') })).toHaveFocus();
    await expect(flagsRequest).toHaveBeenCalledTimes(1);
    await expect(flagsRequest).toHaveBeenCalledWith({ id: 'bob', is_admin: true });
    await expect(quotaRequest).toHaveBeenCalledTimes(1);
    await expect(quotaRequest).toHaveBeenCalledWith({ id: 'bob', processing_limit_minutes: 0 });
  },
};
export const InvalidQuotaThenSaveEnglishMobile: Story = {
  ...InvalidQuotaThenSave, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const ConfirmDeletion: Story = {
  async play({ canvas, userEvent }) {
    await canvas.findByText('Bob');
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('admin.users.delete') }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.getByText(i18n.t('admin.users.deleteBody'))).toBeVisible();
    await expect(dialog.getByText(i18n.t('admin.users.deleteBody'))).toHaveTextContent('Stripe');
  },
};
export const ConfirmDeletionEnglishMobile: Story = {
  ...ConfirmDeletion, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const CancelDeletion: Story = {
  async play(context) {
    await ConfirmDeletion.play!(context);
    const dialog = within(await within(document.body).findByRole('dialog'));
    await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.cancel') }));
    await expect(context.canvas.getByRole('button', { name: i18n.t('admin.users.delete') })).toHaveFocus();
    await expect(deleteRequest).not.toHaveBeenCalled();
  },
};

export const PendingDeletion: Story = {
  async play(context) {
    await ConfirmDeletion.play!(context);
    const { canvas, canvasElement, userEvent } = context;
    const dialog = within(await within(document.body).findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.deleteConfirm') }));
    await expect(await canvas.findByText(i18n.t('admin.users.deletionPending'))).toBeVisible();
    const row = within(canvas.getByText('Bob').closest('tr')!);
    await expect(row.queryByText(i18n.t('admin.users.flags.active'))).not.toBeInTheDocument();
    await expect(canvas.getByText('Bob')).toBeVisible();
    await expect(canvas.getByRole('button', { name: i18n.t('admin.users.edit') })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: i18n.t('admin.users.delete') })).toBeDisabled();
    await expect(await canvas.findByText(i18n.t('admin.users.pageRange', { from: 1, to: 1, total: 1 }))).toBeVisible();
    await expect(deleteRequest).toHaveBeenCalledTimes(1);
    await expect(deleteRequest).toHaveBeenCalledWith({ id: 'bob' });
    await waitFor(() => expect(listRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(canvas.getByRole('heading', { name: i18n.t('admin.users.title') })).toHaveFocus());
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const PendingDeletionEnglishMobile: Story = {
  ...PendingDeletion, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const LongUsernameMobile: Story = {
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
  beforeEach() { editedUser = { ...bob, username: 'administrator'.repeat(12).slice(0, 150) }; },
  async play({ canvas, canvasElement, userEvent }) {
    const username = editedUser.username;
    await canvas.findByText(username);
    const body = within(document.body);
    for (const action of ['edit', 'delete']) {
      await userEvent.click(canvas.getByRole('button', { name: i18n.t(`admin.users.${action}`) }));
      const element = await body.findByRole('dialog');
      const dialog = within(element);
      await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
      if (action === 'edit') {
        await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.cancel') }));
      } else {
        await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.deleteConfirm') }));
      }
      await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
      if (action === 'edit') {
        await expect(canvas.getByRole('button', { name: i18n.t('admin.users.edit') })).toHaveFocus();
      }
    }
    await canvas.findByText(i18n.t('admin.users.deleteSuccess', { username, jobId: 'deletion-fixture' }));
    const notification = canvas.getByRole('alert');
    await expect(notification.scrollWidth).toBeLessThanOrEqual(notification.clientWidth);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const LongUsernameEnglishMobile: Story = {
  ...LongUsernameMobile, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const SearchAfterDeletion: Story = {
  async play(context) {
    await PendingDeletion.play!(context);
    const { canvas, userEvent } = context;
    await userEvent.type(canvas.getByLabelText(i18n.t('admin.users.searchLabel')), 'Alice');
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('admin.users.search') }));
    await canvas.findByText('Alice');
    await expect(canvas.queryByText(i18n.t('admin.users.deletionPending'))).not.toBeInTheDocument();
    await expect(canvas.getByText(i18n.t('admin.users.pageRange', { from: 1, to: 20, total: 21 }))).toBeVisible();
    const next = canvas.getByRole('button', { name: i18n.t('admin.users.next') });
    next.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(listRequest).toHaveBeenLastCalledWith({ q: 'Alice', limit: 20, offset: 20 }));
    await expect(await canvas.findByText(i18n.t('admin.users.pageRange', { from: 21, to: 21, total: 21 }))).toBeVisible();
    await expect(next).toHaveFocus();
    await userEvent.tab({ shift: true });
    const previous = canvas.getByRole('button', { name: i18n.t('admin.users.prev') });
    await expect(previous).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(await canvas.findByText(i18n.t('admin.users.pageRange', { from: 1, to: 20, total: 21 }))).toBeVisible();
    await expect(previous).toHaveFocus();
  },
};
export const SearchAfterDeletionEnglishMobile: Story = {
  ...SearchAfterDeletion, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
