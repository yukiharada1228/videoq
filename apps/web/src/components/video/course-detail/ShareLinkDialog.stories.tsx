import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { longText, shareLink } from '../../../../.storybook/fixtures/detail';
import { ShareLinkDialog } from './ShareLinkDialog';

const label = (key: string) => i18n.t(`videos.courseDetail.${key}`);
function Example(args: ComponentProps<typeof ShareLinkDialog> & { pending?: boolean }) {
  const [open, setOpen] = useState(args.isOpen);
  const [link, setLink] = useState(args.shareLink);
  const [generating, setGenerating] = useState(args.isGeneratingLink);
  const [copied, setCopied] = useState(args.isCopied);
  return <><Button onClick={() => setOpen(true)}>{label('shareOpen')}</Button>
    <ShareLinkDialog {...args} isOpen={open} shareLink={link} isGeneratingLink={generating} isCopied={copied}
      onOpenChange={value => { args.onOpenChange(value); setOpen(value); }}
      onGenerate={slug => { void args.onGenerate(slug); if (args.pending) setGenerating(true); else { setLink(`https://videoq.example/shared/${slug}`); setCopied(false); } }}
      onDelete={() => { args.onDelete(); setLink(null); }} onCopy={() => { args.onCopy(); setCopied(true); }} />
  </>;
}
const meta = {
  title: 'Video/ShareLinkDialog', component: ShareLinkDialog,
  args: { isOpen: false, shareSlug: 'linear-algebra', shareLink: null, isGeneratingLink: false, isCopied: false, onOpenChange: fn(), onGenerate: fn(), onDelete: fn(), onCopy: fn() },
  render: (args, { parameters }) => <Example {...args} pending={parameters.pending} />,
  parameters: { docs: { story: { inline: false, height: '950px' } } },
  async play({ canvas, userEvent }) { await userEvent.click(canvas.getByRole('button', { name: label('shareOpen') })); await expect(within(canvas.getByRole('dialog')).getByRole('heading')).toHaveFocus(); },
} satisfies Meta<typeof ShareLinkDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story['play']>>[0];
async function open(context: Context) { await meta.play(context); return within(context.canvas.getByRole('dialog')); }
async function expectCloseWithinViewport(context: Context) {
  const close = within(context.canvas.getByRole('dialog')).getByRole('button', { name: i18n.t('common.actions.close') });
  await expect(close.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  await expect(close.getBoundingClientRect().bottom).toBeLessThanOrEqual(close.ownerDocument.documentElement.clientHeight);
}
export const NoLink: Story = { async play(context) {
  const dialog = await open(context);
  await expect(dialog.queryByRole('button', { name: label('copyButton') })).not.toBeInTheDocument();
  await expect(dialog.getByText(i18n.t('courseSharing.quotaAndHistory'))).toBeVisible();
} };
export const WithLink: Story = { args: { shareLink }, async play(context) { const dialog = await open(context); await expect(dialog.getByText(shareLink)).toBeVisible(); } };
export const BlankSlug: Story = { args: { shareSlug: '  ' }, async play(context) { const dialog = await open(context); await expect(dialog.getByRole('button', { name: i18n.t('common.actions.save') })).toBeDisabled(); } };
export const Generate: Story = { async play(context) { const dialog = await open(context); await context.userEvent.clear(dialog.getByRole('textbox')); await context.userEvent.type(dialog.getByRole('textbox'), 'lesson-2026'); await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.save') })); await expect(context.args.onGenerate).toHaveBeenCalledWith('lesson-2026'); await expect(dialog.getByText('https://videoq.example/shared/lesson-2026')).toBeVisible(); } };
export const Generating: Story = { parameters: { pending: true }, async play(context) { const dialog = await open(context); await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.save') })); await expect(dialog.getByRole('textbox')).toBeDisabled(); await expect(dialog.getByRole('button', { name: label('generating') })).toBeDisabled(); await expect(dialog.getByRole('button', { name: i18n.t('common.actions.close') })).toBeDisabled(); context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true })); await expect(context.canvas.getByRole('dialog')).toBeVisible(); await expect(context.args.onOpenChange).not.toHaveBeenCalled(); } };
export const UpdatingLink: Story = { ...Generating, args: { shareLink }, async play(context) { await Generating.play!(context); await expect(within(context.canvas.getByRole('dialog')).getByRole('button', { name: label('disable') })).toBeDisabled(); } };
export const Copied: Story = { args: { shareLink }, async play(context) { const dialog = await open(context); await context.userEvent.click(dialog.getByRole('button', { name: label('copyButton') })); await expect(dialog.getByRole('button', { name: label('copied') })).toHaveFocus(); await expect(context.args.onCopy).toHaveBeenCalledTimes(1); } };
export const DisableLink: Story = { args: { shareLink }, async play(context) { const dialog = await open(context); await context.userEvent.click(dialog.getByRole('button', { name: label('disable') })); await expect(context.args.onDelete).toHaveBeenCalledTimes(1); await expect(dialog.queryByText(shareLink)).not.toBeInTheDocument(); } };
export const KeyboardClose: Story = { async play(context) { const dialog = await open(context); await context.userEvent.tab(); await expect(dialog.getByRole('textbox')).toHaveFocus(); await context.userEvent.tab(); await expect(dialog.getByRole('button', { name: i18n.t('common.actions.save') })).toHaveFocus(); await context.userEvent.tab(); await context.userEvent.keyboard('{Enter}'); await expect(context.canvas.getByRole('button', { name: label('shareOpen') })).toHaveFocus(); } };
export const EscapeClose: Story = { async play(context) { await open(context); context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true })); await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument()); await expect(context.args.onOpenChange).toHaveBeenCalledWith(false); } };
export const LongUrlMobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } }, args: { shareSlug: 'lesson'.repeat(10), shareLink: shareLink + longText }, async play(context) {
  const dialog = await open(context);
  const content = context.canvas.getByRole('dialog').querySelector('[data-slot="dialog-content"]')!;
  await expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth);
  await expectCloseWithinViewport(context);
  await context.userEvent.click(dialog.getByRole('button', { name: label('copyButton') }));
  await expect(context.args.onCopy).toHaveBeenCalledTimes(1);
  await expectCloseWithinViewport(context);
} };
export const EnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } }, args: { shareLink }, async play(context) {
  await open(context);
  await expectCloseWithinViewport(context);
} };
