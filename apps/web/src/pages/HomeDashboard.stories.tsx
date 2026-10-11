import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import HomeDashboard from './HomeDashboard';
import i18n from '@/i18n/config';
import { authFixture, regularUser } from '../../.storybook/fixtures/auth';
import { success, trpcQuery } from '../../.storybook/mocks/network';

const basic = {
  ...regularUser, plan_code: 'basic' as const,
  used_storage_bytes: 10 * 1024 ** 3, storage_limit_bytes: 20 * 1024 ** 3,
  used_upload_bytes: 200 * 1024 ** 3, monthly_upload_limit_bytes: 200 * 1024 ** 3,
  used_processing_seconds: 120 * 60, processing_limit_seconds: 300 * 60,
  used_ai_answers: 100, ai_answers_limit: 1800,
};
const meta = {
  title: 'Pages/HomeDashboard', component: HomeDashboard,
  parameters: { pathname: '/', api: { auth: authFixture(basic), trpc: [
    trpcQuery('videos.list', success({ data: [], meta: { total: 0, offset: 0, limit: 5 } })),
    trpcQuery('courses.list', success({ data: [], meta: { total: 0, offset: 0, limit: 1 } })),
    trpcQuery('videos.statusCounts', success({ total: 0, completed: 0, pending: 0, processing: 0, indexing: 0, error: 0, uploading: 0 })),
  ] } },
} satisfies Meta<typeof HomeDashboard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MonthlyAllowanceUsed: Story = {
  async play({ canvas, canvasElement }) {
    const monthly = await canvas.findByText(i18n.t('quota.usage.monthlyUpload'));
    await expect(monthly.parentElement).toHaveTextContent('200GB/200GB');
    await expect(canvas.getByText(i18n.t('quota.usage.storage')).parentElement).toHaveTextContent('10GB/20GB');
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const EnglishMobile: Story = {
  ...MonthlyAllowanceUsed, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
