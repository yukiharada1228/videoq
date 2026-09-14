import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { feedback } from '../../../.storybook/fixtures/dashboard';
import { FeedbackDonutChart } from './FeedbackDonutChart';

const meta = {
  title: 'Dashboard/FeedbackDonutChart',
  component: FeedbackDonutChart,
  decorators: [(Story, context) => <div style={{ width: '100%', maxWidth: context.parameters.chartWidth ?? 520, minHeight: 280 }}><Story /></div>],
  parameters: {
    docs: { description: { component: '実際のRechartsで凡例とツールチップを確認します。全件0のときはグラフ全体が非表示になります。固定幅の親と220pxのグラフ高を使用します。' } },
  },
  args: { data: feedback },
} satisfies Meta<typeof FeedbackDonutChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {
  play: async ({ canvas }) => {
    const chart = await canvas.findByRole('application');
    await waitFor(() => expect(chart.getBoundingClientRect().height).toBe(220));
    await expect(chart.getBoundingClientRect().width).toBeGreaterThan(0);
    for (const key of ['good', 'bad', 'none']) {
      await expect(canvas.getByText(i18n.t(`dashboard.feedback.${key}`))).toBeVisible();
    }
  },
};
export const AllZeroHidden: Story = {
  args: { data: { good: 0, bad: 0, none: 0 } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('application')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
  },
};
export const OnlyGood: Story = { args: { data: { good: 40, bad: 0, none: 0 } } };
export const OnlyBad: Story = { args: { data: { good: 0, bad: 40, none: 0 } } };
export const OnlyUnrated: Story = { args: { data: { good: 0, bad: 0, none: 40 } } };
export const Skewed: Story = { args: { data: { good: 1, bad: 1, none: 998 } } };
export const HoverTooltip: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('.recharts-pie-sector')).toHaveLength(3), { timeout: 3000 });
    await userEvent.hover(canvasElement.querySelectorAll('.recharts-pie-sector')[1]);
    const tooltip = await canvas.findByRole('status');
    await expect(within(tooltip).getByText(i18n.t('dashboard.feedback.bad'))).toBeVisible();
    await expect(within(tooltip).getByText('6')).toBeVisible();
  },
};
export const KeyboardTooltip: Story = {
  play: async ({ canvas, userEvent }) => {
    const chart = await canvas.findByRole('application');
    chart.focus();
    await expect(chart).toHaveFocus();
    const tooltip = await canvas.findByRole('status');
    await expect(within(tooltip).getByText(i18n.t('dashboard.feedback.good'))).toBeVisible();
    await expect(within(tooltip).getByText('24')).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    await expect(within(tooltip).getByText(i18n.t('dashboard.feedback.bad'))).toBeVisible();
    await expect(within(tooltip).getByText('6')).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    await expect(within(tooltip).getByText(i18n.t('dashboard.feedback.none'))).toBeVisible();
    await expect(within(tooltip).getByText('10')).toBeVisible();
  },
};
export const JapaneseMobile: Story = {
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishNarrow: Story = {
  parameters: { chartWidth: 280 },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
