import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn } from 'storybook/test';
import i18n from '@/i18n/config';
import { englishTags, longTag, manyTags, tags } from '../../../.storybook/fixtures/tags';
import { TagFilterPanel } from './TagFilterPanel';

function FilterExample(args: ComponentProps<typeof TagFilterPanel>) {
  const [selectedTagIds, setSelectedTagIds] = useState(args.selectedTagIds);
  return (
    <TagFilterPanel
      {...args}
      selectedTagIds={selectedTagIds}
      onToggle={(id) => {
        args.onToggle(id);
        setSelectedTagIds((current) => current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]);
      }}
      onClear={() => { args.onClear(); setSelectedTagIds([]); }}
    />
  );
}

const meta = {
  title: 'Video/TagFilterPanel',
  component: TagFilterPanel,
  args: { tags, selectedTagIds: [], onToggle: fn(), onClear: fn(), onManageTags: fn(), disabled: false },
  decorators: [(Story) => <div className="max-w-3xl"><Story /></div>],
  render: (args) => <FilterExample key={JSON.stringify([args.tags, args.selectedTagIds])} {...args} />,
} satisfies Meta<typeof TagFilterPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Unselected: Story = {};
export const MultipleSelected: Story = { args: { selectedTagIds: [1, 2] } };
export const WithoutManageButton: Story = { args: { onManageTags: undefined } };
export const NoTags: Story = {
  args: { tags: [] },
  parameters: { docs: { description: { story: 'タグが0件の場合はパネル全体を表示しません。' } } },
  play: async ({ canvas }) => { await expect(canvas.queryByRole('heading')).not.toBeInTheDocument(); },
};
export const Disabled: Story = {
  args: { ...MultipleSelected.args, disabled: true },
  play: async ({ canvas, userEvent, args }) => {
    for (const button of canvas.getAllByRole('button')) await expect(button).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: `${args.tags[0].name} (${args.tags[0].video_count})` }));
    await userEvent.keyboard('{Enter}');
    await expect(args.onToggle).not.toHaveBeenCalled();
    await expect(args.onClear).not.toHaveBeenCalled();
    await expect(args.onManageTags).not.toHaveBeenCalled();
  },
};
export const LongNames: Story = {
  args: { tags: [...tags, longTag], selectedTagIds: [longTag.id] },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const ManyTags: Story = { args: { tags: manyTags, selectedTagIds: [100, 111, 125] } };
export const ToggleAndClear: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const first = canvas.getByRole('button', { name: `${args.tags[0].name} (${args.tags[0].video_count})` });
    await userEvent.click(first);
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard(' ');
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    const second = canvas.getByRole('button', { name: `${args.tags[1].name} (${args.tags[1].video_count})` });
    await expect(second).toHaveFocus();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText(i18n.t('tags.filter.selected', { count: 1 }))).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('tags.filter.clear') }));
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onClear).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole('button', { name: i18n.t('tags.filter.clear') })).not.toBeInTheDocument();
  },
};
export const ManageTags: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('tags.management.title') }));
    await expect(args.onManageTags).toHaveBeenCalledTimes(1);
  },
};
export const EnglishMobile: Story = {
  args: { tags: englishTags, selectedTagIds: [1, 2] },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
