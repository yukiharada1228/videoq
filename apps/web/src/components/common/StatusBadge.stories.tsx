import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from './StatusBadge';

const statuses = ['uploading', 'pending', 'processing', 'indexing', 'completed', 'error'];
const meta = {
  title: 'Common/StatusBadge',
  component: StatusBadge,
  parameters: { a11y: { test: 'error' } },
  args: { status: 'completed', size: 'sm' },
  argTypes: {
    status: { control: 'select', options: statuses },
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md'] },
  },
} satisfies Meta<typeof StatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Completed: Story = {};
export const Uploading: Story = { args: { status: 'uploading' } };
export const Pending: Story = { args: { status: 'pending' } };
export const Processing: Story = { args: { status: 'processing' } };
export const Indexing: Story = { args: { status: 'indexing' } };
export const Error: Story = { args: { status: 'error' } };
export const ExtraSmall: Story = { args: { size: 'xs' } };
export const Medium: Story = { args: { size: 'md' } };
export const EnglishMobile: Story = {
  render: (args) => <div className="flex flex-wrap gap-2">{statuses.map((status) => <StatusBadge {...args} key={status} status={status} />)}</div>,
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
