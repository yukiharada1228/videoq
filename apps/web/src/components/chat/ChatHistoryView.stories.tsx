import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import i18n from '@/i18n/config';
import { ChatHistoryView } from './ChatHistoryView';
import { citations, longAnswer, mathAnswer } from '../../../.storybook/fixtures/chat';
import { completedEvaluation, englishAnswer, englishCitations, englishQuestion, failedEvaluation, historyItem, mixedHistory, pendingEvaluation } from '../../../.storybook/fixtures/chatHistory';

const meta = {
  title: 'Chat/ChatHistoryView',
  component: ChatHistoryView,
  decorators: [(Story) => <div className="flex flex-col border border-solid-gray-200 bg-white" style={{ maxWidth: 800, height: 640 }}><Story /></div>],
  parameters: {
    docs: { description: { component: '日時と投稿者を固定した履歴。評価状態とCSV出力中の表示を切り替えられます。CSV・引用の操作はActionsに記録し、ファイルの生成やAPI接続は行いません。' } },
  },
  args: {
    history: [historyItem],
    historyLoading: false,
    isExportingHistoryCsv: false,
    onExportHistoryCsv: fn().mockResolvedValue(undefined),
    onVideoNavigate: fn(),
  },
} satisfies Meta<typeof ChatHistoryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { history: null, historyLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('progressbar', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
    await expect(canvas.queryByText(i18n.t('chat.historyEmpty'))).not.toBeInTheDocument();
  },
};
export const Empty: Story = {
  args: { history: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('chat.historyEmpty'))).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
  },
};
export const NullHistory: Story = { ...Empty, args: { history: null } };
export const MultipleItems: Story = { args: { history: mixedHistory } };
export const KnownAuthor: Story = {
  globals: { locale: 'ja' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(historyItem.asked_by!.username)).toBeVisible();
    await expect(canvas.getByText(historyItem.asked_by!.email)).toBeVisible();
    await expect(canvas.getByText(new Date(historyItem.created_at).toLocaleString('ja'))).toBeVisible();
  },
};
export const SharedLinkVisitor: Story = {
  args: { history: [{ ...historyItem, asked_by: null, is_shared_origin: true }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('chat.sharedLinkUser'))).toBeVisible();
    await expect(canvas.queryByText(historyItem.asked_by!.email)).not.toBeInTheDocument();
  },
};
export const LongQuestionAndAnswer: Story = {
  args: {
    history: [{
      ...historyItem,
      asked_by: { ...historyItem.asked_by!, email: 'hanako.yamada.linear-algebra.study-group@example.test' },
      question: '回転前後でベクトルの長さが変わらない理由を、講義の具体例と数式を使って説明してください。'.repeat(6),
      answer: `${longAnswer}\n\n${mathAnswer}`,
      evaluation: completedEvaluation,
    }],
  },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const NoEvaluation: Story = {
  play: async ({ canvas }) => {
    for (const status of ['pending', 'failed', 'completed']) {
      await expect(canvas.queryByText(i18n.t(`chat.evaluation.status.${status}`))).not.toBeInTheDocument();
    }
  },
};
export const EvaluationPending: Story = {
  args: { history: [{ ...historyItem, evaluation: pendingEvaluation }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('chat.evaluation.status.pending'))).toBeVisible();
    await expect(canvas.queryByText(i18n.t('chat.evaluation.metrics.faithfulness'))).not.toBeInTheDocument();
  },
};
export const EvaluationFailed: Story = {
  args: { history: [{ ...historyItem, evaluation: failedEvaluation }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('chat.evaluation.status.failed'))).toBeVisible();
    await expect(canvas.queryByText(failedEvaluation.error_message!)).not.toBeInTheDocument();
  },
};
export const EvaluationCompleted: Story = {
  args: { history: [{ ...historyItem, evaluation: completedEvaluation }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('chat.evaluation.status.completed'))).toBeVisible();
    for (const score of ['94%', '88%', '100%']) {
      await expect(canvas.getByText(score)).toBeVisible();
    }
  },
};
export const MissingMetrics: Story = {
  args: { history: [{ ...historyItem, evaluation: { ...completedEvaluation, faithfulness: null, answer_relevancy: 0, context_precision: null } }] },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('-')).toHaveLength(2);
    await expect(canvas.getByText('0%')).toBeVisible();
  },
};
export const ExportingCsv: Story = {
  args: { isExportingHistoryCsv: true },
  play: async ({ canvas, userEvent, args }) => {
    const csv = canvas.getByRole('button', { name: 'CSV' });
    const citation = canvas.getByRole('button', { name: `${citations[0].title} ${citations[0].start_time}` });
    await expect(csv).toBeDisabled();
    citation.focus();
    await userEvent.tab({ shift: true });
    await expect(csv).not.toHaveFocus();
    await expect(args.onExportHistoryCsv).not.toHaveBeenCalled();
  },
};
export const KeyboardExportAndCitation: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const csv = canvas.getByRole('button', { name: 'CSV' });
    csv.focus();
    await expect(csv).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onExportHistoryCsv).toHaveBeenCalledTimes(1);
    await userEvent.tab();
    const citation = canvas.getByRole('button', { name: `${citations[0].title} ${citations[0].start_time}` });
    await expect(citation).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(args.onVideoNavigate).toHaveBeenCalledWith(7, '00:21:37');
  },
};
export const JapaneseMobile: Story = {
  args: { history: mixedHistory },
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishMobile: Story = {
  args: {
    history: [{ ...historyItem, asked_by: null, is_shared_origin: true, question: englishQuestion, answer: englishAnswer, citations: englishCitations, evaluation: completedEvaluation }],
  },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Shared-link visitor')).toBeVisible();
    await expect(canvas.getByText('Faithfulness')).toBeVisible();
    await expect(canvas.getByText(new Date(historyItem.created_at).toLocaleString('en'))).toBeVisible();
  },
};
