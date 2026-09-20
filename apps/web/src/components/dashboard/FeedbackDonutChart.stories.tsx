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

function preferReducedMotion() {
  const matchMedia = window.matchMedia;
  window.matchMedia = (query) => {
    const result = matchMedia.call(window, query);
    if (query === '(prefers-reduced-motion: reduce)') {
      Object.defineProperty(result, 'matches', { value: true });
    }
    return result;
  };
  return () => { window.matchMedia = matchMedia; };
}

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
  // Pie replaces sector nodes while animating; a queued hover can target a
  // detached node. Use Recharts' native reduced-motion behavior for interaction
  // checks. Other stories retain the normal animation, and cleanup restores it.
  beforeEach: preferReducedMotion,
  parameters: {
    docs: { description: { story: 'ブラウザーの「動きを減らす」設定でホバー・解除を検証します。通常のアニメーションはMixedなどのStoryで確認できます。' } },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('.recharts-pie-sector')).toHaveLength(3), { timeout: 3000 });
    const sector = canvasElement.querySelectorAll('.recharts-pie-sector')[1];
    const hover = async () => {
      await userEvent.hover(sector);
      const tooltip = await canvas.findByRole('status');
      await expect(within(tooltip).getByText(i18n.t('dashboard.feedback.bad'))).toBeVisible();
      await expect(within(tooltip).getByText('6')).toBeVisible();
    };
    await hover();
    await userEvent.unhover(sector);
    await waitFor(() => expect(canvas.queryByRole('status')).not.toBeInTheDocument());
    await hover();
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
  ...HoverTooltip,
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishNarrow: Story = {
  ...HoverTooltip,
  parameters: { ...HoverTooltip.parameters, chartWidth: 280 },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
