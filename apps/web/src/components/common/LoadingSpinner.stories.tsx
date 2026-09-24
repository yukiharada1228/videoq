import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LoadingSpinner } from './LoadingSpinner';

const meta = {
  title: 'Common/LoadingSpinner',
  component: LoadingSpinner,
  parameters: { a11y: { test: 'error' } },
  args: { message: '動画を読み込み中…' },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
  async play({ canvas, args }) {
    await expect(canvas.getByRole('progressbar', { name: args.message ?? 'Loading' })).toBeVisible();
  },
} satisfies Meta<typeof LoadingSpinner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const DefaultLoadingMessage: Story = { args: { message: undefined } };
export const EnglishMobile: Story = {
  args: { message: 'Loading your videos. This may take a moment…' },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
