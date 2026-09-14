import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { authFixtures } from '../../../.storybook/fixtures/auth';
import { tags, englishTags, longTag, manyTags } from '../../../.storybook/fixtures/tags';
import { failure, pending, success, trpcHandler, trpcMutation, trpcQuery } from '../../../.storybook/mocks/network';
import { TagManagementModal } from './TagManagementModal';

interface TagScenario { tags?: typeof tags; result?: 'pending' | 'error' | 'retry' }
const deleteRequest = fn();
const deleteError = 'タグを削除できませんでした / Failed to delete tag';

function TagManagementExample(args: ComponentProps<typeof TagManagementModal>) {
  const [open, setOpen] = useState(args.isOpen);
  return <>
    <Button onClick={() => setOpen(true)}>{i18n.t('tags.management.title')}</Button>
    <TagManagementModal {...args} isOpen={open} onClose={() => { args.onClose(); setOpen(false); }} />
  </>;
}

const meta = {
  title: 'Video/TagManagementModal',
  component: TagManagementModal,
  args: { isOpen: false, onClose: fn() },
  render: args => <TagManagementExample key={String(args.isOpen)} {...args} />,
  parameters: { api: { auth: authFixtures.user }, docs: { story: { inline: false, height: '900px' } } },
  beforeEach({ parameters, msw }) {
    const scenario: TagScenario = parameters.tagManagement ?? {};
    let rows = structuredClone(scenario.tags ?? tags);
    let attempts = 0;
    deleteRequest.mockClear();
    msw.use(trpcHandler([
      trpcQuery('tags.list', () => success({ data: rows, meta: { total: rows.length, limit: 100, offset: 0 } })),
      trpcMutation('tags.delete', input => {
        deleteRequest(input); attempts++;
        if (scenario.result === 'pending') return pending();
        if (scenario.result === 'error' || (scenario.result === 'retry' && attempts === 1)) return failure(deleteError);
        rows = rows.filter(tag => tag.id !== input.id);
        return success({ success: true as const });
      }),
    ]));
  },
  async play({ canvas, userEvent }) {
    if (!canvas.queryByRole('dialog')) await userEvent.click(canvas.getByRole('button', { name: i18n.t('tags.management.title') }));
    await expect(within(await canvas.findByRole('dialog')).getByRole('heading')).toHaveFocus();
  },
} satisfies Meta<typeof TagManagementModal>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story['play']>>[0];

async function openList(context: Context, id = tags[0].id) {
  await meta.play(context);
  const dialog = within(context.canvas.getByRole('dialog'));
  await dialog.findByTestId(`delete-tag-${id}`);
  return dialog;
}
async function confirmRow(context: Context, id = tags[0].id) {
  const dialog = await openList(context, id);
  await context.userEvent.click(dialog.getByTestId(`delete-tag-${id}`));
  return dialog;
}

export const List: Story = { async play(context) {
  const dialog = await openList(context);
  for (const tag of tags) await expect(dialog.getByText(tag.name)).toBeVisible();
} };
export const Empty: Story = {
  parameters: { tagManagement: { tags: [] } satisfies TagScenario },
  async play(context) {
    await meta.play(context);
    await expect(await within(context.canvas.getByRole('dialog')).findByText(i18n.t('tags.selector.noTags'))).toBeVisible();
  },
};
export const ManyTags: Story = {
  parameters: { tagManagement: { tags: manyTags } satisfies TagScenario },
  async play(context) {
    const dialog = await openList(context, manyTags[0].id);
    const last = dialog.getByTestId(`delete-tag-${manyTags.at(-1)!.id}`);
    last.scrollIntoView({ block: 'nearest' });
    await expect(last).toBeVisible();
  },
};
export const LongNamesMobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { tagManagement: { tags: [longTag, { ...tags[0], name: 'LectureNotesAndCollaborativeLearningWorkspaceWithExtendedProjectName' }] } satisfies TagScenario },
  async play(context) {
    const dialog = await openList(context, longTag.id);
    await context.userEvent.click(dialog.getByTestId(`delete-tag-${longTag.id}`));
    const content = context.canvas.getByRole('dialog').querySelector('[data-slot="dialog-content"]')!;
    await expect(dialog.getByTestId(`confirm-delete-${longTag.id}`).getBoundingClientRect().right).toBeLessThanOrEqual(content.getBoundingClientRect().right);
    await expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth);
  },
};
export const EnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  parameters: { tagManagement: { tags: englishTags } satisfies TagScenario },
  async play(context) { await openList(context); },
};
export const DeleteConfirmation: Story = { async play(context) { await confirmRow(context); } };
export const CancelDeletion: Story = { async play(context) {
  const dialog = await confirmRow(context);
  await context.userEvent.click(dialog.getByTestId(`cancel-delete-${tags[0].id}`));
  await expect(deleteRequest).not.toHaveBeenCalled();
  await expect(dialog.getByTestId(`delete-tag-${tags[0].id}`)).toHaveFocus();
} };
export const Deleting: Story = {
  parameters: { tagManagement: { result: 'pending' } satisfies TagScenario },
  async play(context) {
    const dialog = await confirmRow(context);
    await context.userEvent.click(dialog.getByTestId(`confirm-delete-${tags[0].id}`));
    await waitFor(() => expect(dialog.getByTestId(`confirm-delete-${tags[0].id}`)).toHaveAttribute('aria-busy', 'true'));
    for (const button of dialog.getAllByRole('button')) await expect(button).toBeDisabled();
    context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(context.canvas.getByRole('dialog')).toBeVisible();
    await expect(context.args.onClose).not.toHaveBeenCalled();
    await expect(deleteRequest).toHaveBeenCalledTimes(1);
  },
};
export const DeleteSucceeded: Story = { async play(context) {
  const dialog = await confirmRow(context);
  await context.userEvent.click(dialog.getByTestId(`confirm-delete-${tags[0].id}`));
  await waitFor(() => expect(dialog.queryByText(tags[0].name)).not.toBeInTheDocument());
  await expect(dialog.getByText(tags[1].name)).toBeVisible();
  await expect(deleteRequest).toHaveBeenCalledWith({ id: tags[0].id });
  await expect(dialog.getByRole('heading')).toHaveFocus();
} };
export const DeleteFailed: Story = {
  parameters: { tagManagement: { result: 'error' } satisfies TagScenario },
  async play(context) {
    const dialog = await confirmRow(context);
    await context.userEvent.click(dialog.getByTestId(`confirm-delete-${tags[0].id}`));
    await expect(await dialog.findByRole('alert')).toHaveTextContent(deleteError);
    await expect(dialog.getByTestId(`confirm-delete-${tags[0].id}`)).toBeEnabled();
    await expect(dialog.getByText(tags[0].name)).toBeVisible();
  },
};
export const FailureThenRetry: Story = {
  parameters: { tagManagement: { result: 'retry' } satisfies TagScenario },
  async play(context) {
    await DeleteFailed.play!(context);
    const dialog = within(context.canvas.getByRole('dialog'));
    await context.userEvent.click(dialog.getByTestId(`confirm-delete-${tags[0].id}`));
    await waitFor(() => expect(dialog.queryByText(tags[0].name)).not.toBeInTheDocument());
    await expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    await expect(deleteRequest).toHaveBeenCalledTimes(2);
  },
};
export const ErrorOutsideScrollArea: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { tagManagement: { tags: manyTags, result: 'error' } satisfies TagScenario },
  async play(context) {
    const id = manyTags.at(-1)!.id;
    const dialog = await confirmRow(context, id);
    await context.userEvent.click(dialog.getByTestId(`confirm-delete-${id}`));
    const alert = await dialog.findByRole('alert');
    const scroller = context.canvas.getByRole('dialog').querySelector('.overflow-y-auto')!;
    await expect(scroller).not.toContainElement(alert);
    await expect(scroller.scrollTop).toBeGreaterThan(0);
    await expect(alert.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    await expect(alert.getBoundingClientRect().bottom).toBeLessThanOrEqual(context.canvasElement.ownerDocument.documentElement.clientHeight);
  },
};
export const KeyboardDeleteLastTag: Story = {
  parameters: { tagManagement: { tags: [tags[0]] } satisfies TagScenario },
  async play(context) {
    const dialog = await openList(context);
    await context.userEvent.tab();
    await expect(dialog.getByTestId(`delete-tag-${tags[0].id}`)).toHaveFocus();
    await context.userEvent.keyboard('{Enter}');
    await expect(dialog.getByTestId(`cancel-delete-${tags[0].id}`)).toHaveFocus();
    await context.userEvent.tab({ shift: true });
    await expect(dialog.getByTestId(`confirm-delete-${tags[0].id}`)).toHaveFocus();
    await context.userEvent.keyboard('{Enter}');
    await expect(await dialog.findByText(i18n.t('tags.selector.noTags'))).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveFocus();
  },
};
export const CloseAndReopen: Story = { async play(context) {
  const dialog = await confirmRow(context);
  await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.close') }));
  await expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument();
  await expect(context.canvas.getByRole('button', { name: i18n.t('tags.management.title') })).toHaveFocus();
  const reopened = await openList(context);
  await expect(reopened.queryByTestId(`confirm-delete-${tags[0].id}`)).not.toBeInTheDocument();
} };
export const EscapeRequest: Story = { async play(context) {
  await openList(context);
  context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument());
  await expect(context.args.onClose).toHaveBeenCalledTimes(1);
  await expect(context.canvas.getByRole('button', { name: i18n.t('tags.management.title') })).toHaveFocus();
} };
