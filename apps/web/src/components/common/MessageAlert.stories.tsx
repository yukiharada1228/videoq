import type { Meta, StoryObj } from '@storybook/react-vite';
import { MessageAlert } from './MessageAlert';

const meta = {
  title: 'Common/MessageAlert',
  component: MessageAlert,
  parameters: { a11y: { test: 'error' } },
  args: { type: 'success', message: '変更を保存しました。' },
  argTypes: { type: { control: 'inline-radio', options: ['success', 'warning', 'error'] } },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof MessageAlert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};
export const Warning: Story = { args: { type: 'warning', message: '動画は保存されましたが、一部のタグを追加できませんでした。' } };
export const Error: Story = { args: { type: 'error', message: '保存に失敗しました。時間をおいて再度お試しください。' } };
export const LongMessage: Story = {
  args: { type: 'warning', message: '保存容量が上限に近づいています。新しい動画を追加できなくなる場合があります。不要な動画を削除して空き容量を確保してから、アップロードを続けてください。' },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishMobile: Story = {
  args: { type: 'error', message: 'Your changes could not be saved. Check your connection and try again.' },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
