import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LoadingState } from './LoadingState';

const meta = {
  title: 'Common/LoadingState',
  component: LoadingState,
  args: {
    isLoading: true,
    error: null,
    loadingMessage: '動画を読み込み中…',
    children: <p className="text-std-16N-170">動画の一覧がここに表示されます。</p>,
  },
  argTypes: { children: { control: false } },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof LoadingState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const DefaultLoadingMessage: Story = {
  args: { loadingMessage: undefined },
  parameters: { docs: { description: { story: 'loadingMessageを省略した場合の既定文言は「Loading」です。' } } },
};
export const Error: Story = { args: { isLoading: false, error: '動画を取得できませんでした。' } };
export const FriendlyError: Story = {
  args: { isLoading: false, error: 'Network request failed', errorMessage: '通信状態を確認して、もう一度お試しください。' },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(args.errorMessage!);
    await expect(canvas.queryByText(args.error!)).not.toBeInTheDocument();
  },
};
export const Ready: Story = {
  args: { isLoading: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('動画の一覧がここに表示されます。')).toBeVisible();
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
export const LoadingBeforeError: Story = {
  args: { error: '前回の読み込みに失敗しました。' },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('progressbar', { name: args.loadingMessage })).toBeVisible();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
export const EnglishMobile: Story = {
  args: { loadingMessage: 'Loading your videos. This may take a moment…', children: <p>Your videos appear here.</p> },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
