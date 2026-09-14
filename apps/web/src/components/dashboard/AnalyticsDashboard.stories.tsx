import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import i18n from '@/i18n/config';
import { analytics, emptyAnalytics, emptyEvaluation, evaluationSummary, manyDays } from '../../../.storybook/fixtures/dashboard';
import { AnalyticsDashboard } from './AnalyticsDashboard';

const meta = {
  title: 'Dashboard/AnalyticsDashboard',
  component: AnalyticsDashboard,
  decorators: [(Story) => <div style={{ maxWidth: 1120, minHeight: 300 }}><Story /></div>],
  parameters: {
    docs: { description: { component: 'API接続なしで集計データを切り替えられるダッシュボード。質問と評価の読み込みを独立して再現し、空の場合は実際のDashboardEmptyStateを表示します。' } },
  },
  args: { data: analytics, evaluationSummary, isLoading: false, isEvaluationLoading: false },
} satisfies Meta<typeof AnalyticsDashboard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('dashboard.totalQuestions', { count: 40 }))).toBeVisible();
    await expect(canvas.getByText(i18n.t('dashboard.dateRange', { first: '2026-09-01', last: '2026-09-07' }))).toBeVisible();
    await expect(await canvas.findAllByRole('application')).toHaveLength(2);
    await expect(canvas.getByText('94%')).toBeVisible();
  },
};
export const Loading: Story = {
  args: { isLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('progressbar', { name: 'Loading' })).toBeVisible();
    await expect(canvas.queryByRole('application')).not.toBeInTheDocument();
  },
};
export const NoQuestions: Story = {
  args: { data: emptyAnalytics, evaluationSummary: emptyEvaluation },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: i18n.t('dashboard.empty.title') })).toBeVisible();
    await expect(canvas.getByText(i18n.t('dashboard.empty.description'))).toBeVisible();
    await expect(canvas.queryByRole('application')).not.toBeInTheDocument();
  },
};
export const MissingData: Story = { ...NoQuestions, args: { data: undefined } };
export const EvaluationLoading: Story = {
  args: { isEvaluationLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('progressbar', { name: 'Loading' })).toBeVisible();
    await expect(await canvas.findAllByRole('application')).toHaveLength(2);
    await expect(canvas.queryByText('94%')).not.toBeInTheDocument();
  },
};
export const NoEvaluations: Story = { args: { evaluationSummary: emptyEvaluation } };
export const NoTimeSeries: Story = {
  args: { data: { ...analytics, time_series: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading', { name: i18n.t('dashboard.timeSeries.title') })).not.toBeInTheDocument();
    await expect(await canvas.findAllByRole('application')).toHaveLength(1);
    await expect(canvas.getByText('94%')).toBeVisible();
  },
};
export const MissingDateRange: Story = { args: { data: { ...analytics, summary: { ...analytics.summary, date_range: { first: null, last: null } } } } };
export const NinetyDays: Story = {
  args: {
    data: {
      summary: { total_questions: manyDays.reduce((total, day) => total + day.count, 0), date_range: { first: manyDays[0].date, last: manyDays.at(-1)!.date } },
      time_series: manyDays,
      feedback: { good: 120, bad: 5, none: manyDays.reduce((total, day) => total + day.count, 0) - 125 },
    },
    evaluationSummary: { ...evaluationSummary, evaluated_count: 240 },
  },
};
export const JapaneseMobile: Story = {
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishEmpty: Story = {
  ...NoQuestions,
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
