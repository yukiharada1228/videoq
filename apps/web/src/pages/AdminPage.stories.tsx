import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { AdminUser } from '@/lib/api';
import i18n from '@/i18n/config';
import AdminPage from './AdminPage';
import { authFixtures } from '../../.storybook/fixtures/auth';
import { success, trpcMutation, trpcQuery } from '../../.storybook/mocks/network';

const bob: AdminUser = {
  id: 'bob', username: 'Bob', email: 'bob@example.test', is_active: true,
  is_staff: false, is_superuser: false, max_video_upload_size_mb: 200,
  storage_limit_gb: 1, processing_limit_minutes: 45, ai_answers_limit: 30,
  used_storage_bytes: 0, used_processing_seconds: 0, used_ai_answers: 0,
  usage_period_start: null, is_over_quota: false, plan_code: 'free', quota_source: 'plan',
};
const alice = { ...bob, id: 'alice', username: 'Alice', email: 'alice@example.test' };
const deleteRequest = fn();
const listRequest = fn();

const meta = {
  title: 'Pages/Admin',
  component: AdminPage,
  parameters: { pathname: '/admin', api: { auth: authFixtures.admin, trpc: [
    trpcQuery('admin.listUsers', input => {
      listRequest(input);
      return success({ data: input?.q === 'Alice' ? [alice] : [bob],
        meta: { total: input?.q === 'Alice' ? 21 : 1, offset: input?.offset ?? 0, limit: 20 } });
    }),
    trpcMutation('admin.deleteUser', input => {
      deleteRequest(input);
      return success({ job_id: 'deletion-fixture' });
    }),
  ] } },
  beforeEach() { deleteRequest.mockClear(); listRequest.mockClear(); },
} satisfies Meta<typeof AdminPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PendingDeletion: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    await canvas.findByText('Bob');
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('admin.users.delete') }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: i18n.t('admin.users.deleteConfirm') }));
    await expect(await canvas.findByText(i18n.t('admin.users.deletionPending'))).toBeVisible();
    await expect(canvas.getByText('Bob')).toBeVisible();
    await expect(canvas.getByRole('button', { name: i18n.t('admin.users.edit') })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: i18n.t('admin.users.delete') })).toBeDisabled();
    await expect(canvas.getByText(i18n.t('admin.users.pageRange', { from: 1, to: 1, total: 1 }))).toBeVisible();
    await expect(deleteRequest).toHaveBeenCalledTimes(1);
    await expect(deleteRequest).toHaveBeenCalledWith({ id: 'bob' });
    await waitFor(() => expect(listRequest).toHaveBeenCalledTimes(2));
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const PendingDeletionEnglishMobile: Story = {
  ...PendingDeletion, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
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
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('admin.users.next') }));
    await waitFor(() => expect(listRequest).toHaveBeenLastCalledWith({ q: 'Alice', limit: 20, offset: 20 }));
    await expect(canvas.getByText(i18n.t('admin.users.pageRange', { from: 21, to: 21, total: 21 }))).toBeVisible();
  },
};
export const SearchAfterDeletionEnglishMobile: Story = {
  ...SearchAfterDeletion, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
