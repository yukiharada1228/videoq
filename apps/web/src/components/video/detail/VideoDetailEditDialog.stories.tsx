import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { detailVideo, longText } from '../../../../.storybook/fixtures/detail';
import { tags, englishTags, longTag } from '../../../../.storybook/fixtures/tags';
import { VideoDetailEditDialog } from './VideoDetailEditDialog';

const label = (key: string) => i18n.t(key);
const saveError = '動画情報を保存できませんでした / Could not save video information.';
function Example(args: ComponentProps<typeof VideoDetailEditDialog> & { outcome?: 'pending' | 'error' }) {
  const [open, setOpen] = useState(args.isOpen);
  const [title, setTitle] = useState(args.editedTitle);
  const [description, setDescription] = useState(args.editedDescription);
  const [selected, setSelected] = useState(args.editedTagIds);
  const [saving, setSaving] = useState(args.isUpdating);
  const [error, setError] = useState(args.updateError);
  return <><Button onClick={() => setOpen(true)}>{label('videos.detail.editButton')}</Button>
    <VideoDetailEditDialog {...args} isOpen={open} editedTitle={title} editedDescription={description} editedTagIds={selected} isUpdating={saving} updateError={error}
      onOpenChange={value => { args.onOpenChange(value); setOpen(value); }} onEditedTitleChange={setTitle} onEditedDescriptionChange={setDescription} onEditedTagIdsChange={setSelected}
      onSave={() => { args.onSave(); if (args.outcome === 'pending') setSaving(true); else if (args.outcome === 'error') setError(saveError); else setOpen(false); }} />
  </>;
}
const meta = {
  title: 'Video/VideoDetailEditDialog', component: VideoDetailEditDialog,
  args: { isOpen: false, tags, editedTitle: detailVideo.title, editedDescription: detailVideo.description, editedTagIds: [1], isUpdating: false, updateError: null,
    onOpenChange: fn(), onEditedTitleChange: fn(), onEditedDescriptionChange: fn(), onEditedTagIdsChange: fn(), onCreateNewTag: fn(), onSave: fn() },
  parameters: { docs: { story: { inline: false, height: '850px' } } },
  render: (args, { parameters }) => <Example {...args} outcome={parameters.outcome} />,
  async play({ canvas, userEvent }) { await userEvent.click(canvas.getByRole('button', { name: label('videos.detail.editButton') })); await expect(within(canvas.getByRole('dialog')).getByRole('heading')).toHaveFocus(); },
} satisfies Meta<typeof VideoDetailEditDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story['play']>>[0];
async function open(context: Context) { await meta.play(context); return within(context.canvas.getByRole('dialog')); }
export const Editing: Story = { async play(context) { const dialog = await open(context); await expect(dialog.getByRole('textbox', { name: label('videos.detail.editTitleLabel') })).toHaveValue(detailVideo.title); } };
export const ChangeFieldsAndTags: Story = { async play(context) { const dialog = await open(context); await context.userEvent.clear(dialog.getByRole('textbox', { name: label('videos.detail.editTitleLabel') })); await context.userEvent.type(dialog.getByRole('textbox', { name: label('videos.detail.editTitleLabel') }), '更新した動画'); await context.userEvent.type(dialog.getByRole('textbox', { name: label('videos.detail.editDescriptionLabel') }), '\n追加の説明'); const tag = dialog.getByRole('button', { name: tags[1].name }); await context.userEvent.click(tag); await expect(tag).toHaveAttribute('aria-pressed', 'true'); } };
export const EmptyTitle: Story = { args: { editedTitle: '   ' }, async play(context) { const dialog = await open(context); await expect(dialog.getByRole('button', { name: label('common.actions.save') })).toBeDisabled(); } };
export const NoTags: Story = { args: { tags: [], editedTagIds: [] }, async play(context) { const dialog = await open(context); await expect(dialog.getByRole('button', { name: label('common.actions.save') })).toBeEnabled(); } };
export const Saving: Story = { parameters: { outcome: 'pending' }, async play(context) { const dialog = await open(context); await context.userEvent.click(dialog.getByRole('button', { name: label('common.actions.save') })); for (const control of context.canvas.getByRole('dialog').querySelectorAll('input,textarea,button')) await expect(control).toBeDisabled(); context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true })); await expect(context.canvas.getByRole('dialog')).toBeVisible(); await expect(context.args.onOpenChange).not.toHaveBeenCalled(); } };
export const SaveFailed: Story = { parameters: { outcome: 'error' }, async play(context) { const dialog = await open(context); await context.userEvent.click(dialog.getByRole('button', { name: label('common.actions.save') })); await expect(dialog.getByRole('alert')).toHaveTextContent(saveError); await expect(dialog.getByRole('textbox', { name: label('videos.detail.editTitleLabel') })).toHaveValue(detailVideo.title); await expect(dialog.getByRole('button', { name: label('common.actions.save') })).toBeEnabled(); } };
export const SaveSucceeded: Story = { async play(context) { const dialog = await open(context); await context.userEvent.click(dialog.getByRole('button', { name: label('common.actions.save') })); await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument()); await expect(context.args.onSave).toHaveBeenCalledTimes(1); await expect(context.canvas.getByRole('button', { name: label('videos.detail.editButton') })).toHaveFocus(); } };
export const KeyboardAndCancel: Story = { async play(context) { const dialog = await open(context); await context.userEvent.tab(); await expect(dialog.getByRole('textbox', { name: label('videos.detail.editTitleLabel') })).toHaveFocus(); await context.userEvent.tab(); await expect(dialog.getByRole('textbox', { name: label('videos.detail.editDescriptionLabel') })).toHaveFocus(); dialog.getByRole('button', { name: label('common.actions.cancel') }).focus(); await context.userEvent.keyboard('{Enter}'); await expect(context.canvas.getByRole('button', { name: label('videos.detail.editButton') })).toHaveFocus(); } };
export const EscapeClose: Story = { async play(context) { await open(context); context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true })); await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument()); await expect(context.args.onOpenChange).toHaveBeenCalledWith(false); } };
export const LongContentMobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } }, args: { editedTitle: longText, editedDescription: longText, tags: [...tags, longTag] }, async play(context) { await open(context); const content = context.canvas.getByRole('dialog').querySelector('[data-slot="dialog-content"]')!; await expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth); } };
export const EnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } }, args: { editedTitle: 'Rotation matrices', editedDescription: 'Learn through examples.', tags: englishTags }, async play(context) { await open(context); } };
