import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { MessageBody } from './MessageBody';
import { answer, citations, longAnswer, mathAnswer } from '../../../.storybook/fixtures/chat';

const meta = {
  title: 'Chat/MessageBody',
  component: MessageBody,
  decorators: [(Story) => <div style={{ maxWidth: 720 }}><Story /></div>],
  args: { content: '講義動画について質問してください。', onVideoNavigate: fn() },
} satisfies Meta<typeof MessageBody>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PlainText: Story = {};
export const WithCitations: Story = {
  args: { content: answer, citations },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: '線形代数：回転行列 00:21:37' }));
    await expect(args.onVideoNavigate).toHaveBeenCalledWith(7, '00:21:37');
    await userEvent.click(canvas.getByRole('button', { name: '具体例で学ぶベクトル 00:03:10' }));
    await expect(args.onVideoNavigate).toHaveBeenCalledWith(12, '00:03:10');
  },
};
export const MissingCitation: Story = { args: { content: 'この説明に対応する引用データが届いていません。[9]' } };
export const InlineMath: Story = { args: { content: String.raw`直角三角形では \(a^2 + b^2 = c^2\) が成り立ちます。` } };
export const DisplayMath: Story = { args: { content: mathAnswer, citations } };
export const LongText: Story = { args: { content: longAnswer, citations } };
export const English: Story = {
  args: { content: 'A rotation matrix changes the direction of a vector without changing its length. [1]', citations },
  globals: { locale: 'en' },
};
