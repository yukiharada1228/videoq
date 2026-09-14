import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import i18n from '@/i18n/config';
import { emptyEvaluation, evaluationSummary } from '../../../.storybook/fixtures/dashboard';
import { EvaluationSummaryCard } from './EvaluationSummaryCard';

const meta = {
  title: 'Dashboard/EvaluationSummaryCard',
  component: EvaluationSummaryCard,
  decorators: [(Story) => <div style={{ maxWidth: 520, minHeight: 240 }}><Story /></div>],
  args: { summary: evaluationSummary, isLoading: false },
} satisfies Meta<typeof EvaluationSummaryCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('dashboard.evaluation.evaluatedCount', { count: 24 }))).toBeVisible();
    for (const score of ['94%', '88%', '72%']) {
      await expect(canvas.getByText(score)).toBeVisible();
    }
  },
};
export const Loading: Story = {
  args: { isLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('progressbar', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByText('94%')).not.toBeInTheDocument();
  },
};
export const NoEvaluations: Story = {
  args: { summary: emptyEvaluation },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('dashboard.evaluation.empty'))).toBeVisible();
  },
};
export const MissingSummary: Story = { ...NoEvaluations, args: { summary: undefined } };
export const MissingMetrics: Story = {
  args: { summary: { ...evaluationSummary, avg_faithfulness: null, avg_answer_relevancy: 0, avg_context_precision: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('-')).toHaveLength(2);
    await expect(canvas.getByText('0%')).toBeVisible();
    await expect(canvas.queryByText(i18n.t('dashboard.evaluation.empty'))).not.toBeInTheDocument();
  },
};
export const ZeroPercent: Story = {
  args: { summary: { ...evaluationSummary, avg_faithfulness: 0, avg_answer_relevancy: 0, avg_context_precision: 0 } },
};
export const FullPercent: Story = {
  args: { summary: { ...evaluationSummary, avg_faithfulness: 1, avg_answer_relevancy: 1, avg_context_precision: 1 } },
};
export const JapaneseMobile: Story = {
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishLongCount: Story = {
  args: { summary: { ...evaluationSummary, evaluated_count: 12345678 } },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
