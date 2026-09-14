import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { manyDays, timeSeries } from '../../../.storybook/fixtures/dashboard';
import { QuestionTimeSeriesChart } from './QuestionTimeSeriesChart';

const meta = {
  title: 'Dashboard/QuestionTimeSeriesChart',
  component: QuestionTimeSeriesChart,
  decorators: [(Story, context) => <div style={{ width: '100%', maxWidth: context.parameters.chartWidth ?? 720, minHeight: 280 }}><Story /></div>],
  parameters: {
    docs: { description: { component: '固定日付・件数を使用した実際のRecharts。親の幅を設定し、グラフの高さは220pxです。KeyboardTooltipでは矢印キーで日付を移動し、Enterでツールチップを開閉します。' } },
  },
  args: { data: timeSeries },
} satisfies Meta<typeof QuestionTimeSeriesChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  play: async ({ canvas }) => {
    const chart = await canvas.findByRole('application');
    await waitFor(() => expect(chart.getBoundingClientRect().height).toBe(220));
    await expect(chart.getBoundingClientRect().width).toBeGreaterThan(0);
  },
};
export const Empty: Story = { args: { data: [] } };
export const SingleDay: Story = { args: { data: [timeSeries[0]] } };
export const NinetyDays: Story = { args: { data: manyDays } };
export const AllZero: Story = { args: { data: timeSeries.map(day => ({ ...day, count: 0 })) } };
export const LargeSpike: Story = {
  args: { data: timeSeries.map((day, index) => ({ ...day, count: index === 3 ? 10000 : day.count })) },
};
export const KeyboardTooltip: Story = {
  play: async ({ canvas, userEvent }) => {
    const chart = await canvas.findByRole('application');
    chart.focus();
    await expect(chart).toHaveFocus();
    const tooltip = await canvas.findByRole('status');
    await expect(within(tooltip).getByText('09-01')).toBeVisible();
    await expect(within(tooltip).getByText(i18n.t('dashboard.timeSeries.count'))).toBeVisible();
    await expect(within(tooltip).getByText('4')).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    await expect(within(tooltip).getByText('09-02')).toBeVisible();
    await expect(within(tooltip).getByText('7')).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(within(tooltip).getByText('09-01')).toBeVisible();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    await expect(await canvas.findByRole('status')).toBeVisible();
  },
};
export const NarrowContainer: Story = {
  args: { data: manyDays },
  parameters: { chartWidth: 280 },
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
