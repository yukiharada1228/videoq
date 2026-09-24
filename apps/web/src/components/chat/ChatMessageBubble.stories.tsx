import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import i18n from '@/i18n/config';
import { ChatMessageBubble } from './ChatMessageBubble';
import { answer, citations, interrupted, longAnswer, mathAnswer, searching } from '../../../.storybook/fixtures/chat';

const meta = {
  title: 'Chat/ChatMessageBubble',
  component: ChatMessageBubble,
  decorators: [(Story) => <div style={{ maxWidth: 800 }}><Story /></div>],
  args: {
    message: { role: 'assistant', content: '講義動画の内容を一緒に確認しましょう。' },
    isFeedbackUpdating: false,
    onVideoNavigate: fn(),
    onFeedback: fn().mockResolvedValue(undefined),
  },
} satisfies Meta<typeof ChatMessageBubble>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Assistant: Story = {};
export const User: Story = { args: { message: { role: 'user', content: '回転行列について、具体例を使って教えてください。' } } };
export const AwaitingResponse: Story = { args: { message: { role: 'assistant', content: '' }, isAwaitingResponse: true } };
export const Searching: Story = { args: { message: { role: 'assistant', content: '', progress: searching }, isAwaitingResponse: true } };
export const Streaming: Story = { args: { message: { role: 'assistant', content: '回転行列は、ベクトルの長さを変えずに', progress: { ...searching, phase: 'answering' } }, isAwaitingResponse: true } };
export const Interrupted: Story = { args: { message: { role: 'assistant', content: '応答が中断されました。もう一度お試しください。', progress: interrupted } } };
export const WithCitations: Story = { args: { message: { role: 'assistant', content: answer, citations } } };
export const WithMath: Story = { args: { message: { role: 'assistant', content: mathAnswer, citations } } };
export const LongText: Story = { args: { message: { role: 'assistant', content: longAnswer, citations } } };
export const Feedback: Story = {
  args: { message: { role: 'assistant', content: answer, citations, chatLogId: 42 } },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('chat.feedbackGood') }));
    await expect(args.onFeedback).toHaveBeenCalledWith(42, 'good');
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('chat.feedbackBad') }));
    await expect(args.onFeedback).toHaveBeenCalledWith(42, 'bad');
  },
};
export const GoodFeedback: Story = { args: { message: { role: 'assistant', content: answer, chatLogId: 42, feedback: 'good' } } };
export const BadFeedback: Story = { args: { message: { role: 'assistant', content: answer, chatLogId: 42, feedback: 'bad' } } };
export const FeedbackUpdating: Story = {
  args: { message: { role: 'assistant', content: answer, chatLogId: 42 }, isFeedbackUpdating: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: i18n.t('chat.feedbackGood') })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: i18n.t('chat.feedbackBad') })).toBeDisabled();
  },
};
export const EnglishMobile: Story = {
  args: { message: { role: 'assistant', content: 'A rotation matrix changes the direction of a vector without changing its length. [1]', citations, chatLogId: 42 } },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
