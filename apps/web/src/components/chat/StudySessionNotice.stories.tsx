import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import i18n from '@/i18n/config';
import { StudySessionNotice } from './StudySessionNotice';

const meta = {
  title: 'Chat/StudySessionNotice',
  component: StudySessionNotice,
  args: { restarted: false, storageAvailable: true, isLoading: false, onRestart: fn() },
  parameters: { a11y: { test: 'error' } },
  render: args => <div className="flex h-[600px] max-w-lg flex-col"><StudySessionNotice {...args} /></div>,
} satisfies Meta<typeof StudySessionNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
const label = (key: string) => i18n.t(`chat.studySession.${key}`);

export const BeforeSending: Story = { async play({ canvas, userEvent }) {
  await expect(canvas.getByRole('status')).toHaveTextContent(label('unconfirmed'));
  await userEvent.click(canvas.getByText(label('help')));
  await expect(canvas.getByText(label('explanation'))).toBeVisible();
  await expect(canvas.getByRole('link')).toHaveAttribute('href', 'https://docs.videoq.jp/ja/plog/study-sessions/');
} };
export const Continued: Story = { args: { info: { status: 'continued', expires_at: Date.now() + 43_200_000 } }, async play({ canvas }) {
  await expect(canvas.getByRole('status')).toHaveTextContent(label('continued'));
} };
export const Expired: Story = { args: { info: { status: 'continued', expires_at: Date.now() - 1 } }, async play({ canvas }) {
  await expect(canvas.getByRole('status')).toHaveTextContent(label('expired'));
} };
export const Restarted: Story = { args: { restarted: true }, async play({ canvas }) {
  await expect(canvas.getByRole('status')).toHaveTextContent(label('restarted'));
} };
export const StorageUnavailable: Story = { args: { storageAvailable: false }, async play({ canvas }) {
  await expect(canvas.getByText(label('storageUnavailable'))).toBeVisible();
} };
export const EnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } }, async play({ canvas, userEvent }) {
  await userEvent.click(canvas.getByText(label('help')));
  await expect(canvas.getByRole('link')).toHaveAttribute('href', 'https://docs.videoq.jp/plog/study-sessions/');
} };
