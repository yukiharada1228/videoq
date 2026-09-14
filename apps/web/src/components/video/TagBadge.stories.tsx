import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn } from 'storybook/test';
import { englishTags, longTag, paletteTags, tags } from '../../../.storybook/fixtures/tags';
import { TagBadge } from './TagBadge';

function RemovableTag(args: ComponentProps<typeof TagBadge>) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <TagBadge
      {...args}
      onRemove={args.onRemove ? (id) => { args.onRemove?.(id); setVisible(false); } : undefined}
    />
  );
}

const meta = {
  title: 'Video/TagBadge',
  component: TagBadge,
  args: { tag: tags[0], size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: (args) => <RemovableTag key={JSON.stringify(args.tag)} {...args} />,
} satisfies Meta<typeof TagBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const AllColors: Story = {
  render: (args) => <div className="flex flex-wrap gap-2">{paletteTags.map((tag) => <TagBadge {...args} key={tag.id} tag={tag} />)}</div>,
};
export const LegacyColor: Story = { args: { tag: { ...tags[0], color: '#3b82f6' } } };
export const UnknownColorFallback: Story = { args: { tag: { ...tags[0], color: 'unknown' } } };
export const LongName: Story = {
  args: { tag: longTag },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const Removable: Story = {
  args: { onRemove: fn() },
  play: async ({ canvas, userEvent, args }) => {
    const remove = canvas.getByRole('button', { name: `Remove ${args.tag.name}` });
    await userEvent.tab();
    await expect(remove).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onRemove).toHaveBeenCalledWith(args.tag.id);
    await expect(canvas.queryByText(args.tag.name)).not.toBeInTheDocument();
  },
};
export const EnglishMobile: Story = {
  args: { tag: englishTags[0], onRemove: fn() },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
