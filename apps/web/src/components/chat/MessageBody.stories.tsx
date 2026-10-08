import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { MessageBody } from './MessageBody';
import { answerData, citations, longAnswerData, mathAnswerData, syntaxAnswerData } from '../../../.storybook/fixtures/chat';

const meta = {
  title: 'Chat/MessageBody',
  component: MessageBody,
  decorators: [(Story) => <div style={{ maxWidth: 720 }}><Story /></div>],
  args: { answer: { segments: [{ text: '講義動画について質問してください。', sourceIds: [] }], sources: [] }, onVideoNavigate: fn() },
} satisfies Meta<typeof MessageBody>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PlainText: Story = {};
export const WithCitations: Story = {
  args: { answer: answerData },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: '線形代数：回転行列 00:21:37' }));
    await expect(args.onVideoNavigate).toHaveBeenCalledWith(7, '00:21:37');
    await userEvent.click(canvas.getByRole('button', { name: '具体例で学ぶベクトル 00:03:10' }));
    await expect(args.onVideoNavigate).toHaveBeenCalledWith(12, '00:03:10');
  },
};
export const MissingCitation: Story = { args: { answer: { segments: [{ text: "この説明に対応する引用データが届いていません。", sourceIds: [9] }], sources: [] } } };
export const InlineMath: Story = { args: { answer: { segments: [{ text: String.raw`直角三角形では \(a^2 + b^2 = c^2\) が成り立ちます。`, sourceIds: [] }], sources: [] } } };
export const DisplayMath: Story = { args: { answer: mathAnswerData } };
export const MathAndCodeWithCitations: Story = {
  args: { answer: syntaxAnswerData },
  async play({ canvas, canvasElement, userEvent, args }) {
    await expect(Array.from(canvasElement.querySelectorAll('annotation'), node => node.textContent)).toEqual([' x[01] ', 'y', 'z']);
    await expect(canvas.getAllByRole('button')).toHaveLength(2);
    const button = canvas.getByRole('button', { name: '具体例で学ぶベクトル 00:03:10' });
    button.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onVideoNavigate).toHaveBeenCalledWith(12, '00:03:10');
  },
};
export const MathAndCodeEnglishMobile: Story = { ...MathAndCodeWithCitations, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } } };
export const LongText: Story = { args: { answer: longAnswerData } };
export const English: Story = {
  args: { answer: { segments: [{ text: "A rotation matrix changes the direction of a vector without changing its length. ", sourceIds: [1] }], sources: citations } },
  globals: { locale: 'en' },
};
