import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, mocked, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { courseForm, createCourseError, englishCourseForm, longCourseForm } from '../../../.storybook/fixtures/createDialogs';
import { VideoCourseCreateModal } from './VideoCourseCreateModal';

function CourseCreateExample({ isOpen, onClose, onCreate }: ComponentProps<typeof VideoCourseCreateModal>) {
  const [open, setOpen] = useState(isOpen);
  const { t } = useTranslation();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>{t('videos.courses.createTitle')}</Button>
      <VideoCourseCreateModal isOpen={open} onCreate={onCreate} onClose={() => { onClose(); setOpen(false); }} />
    </>
  );
}

const meta = {
  title: 'Video/VideoCourseCreateModal',
  component: CourseCreateExample,
  subcomponents: { VideoCourseCreateModal },
  args: { isOpen: false, onClose: fn(), onCreate: fn().mockResolvedValue(undefined) },
  render: args => <CourseCreateExample key={String(args.isOpen)} {...args} />,
  parameters: {
    docs: { description: { component: 'ボタンから実際の作成フォームを開いて入力します。onCreateは成功・保留・失敗のモックで、APIへの接続はありません。Creatingは処理を保留し、CreateFailedはエラー表示を保持します。閉じた後はボタンで再表示できます。' } },
  },
  play: async ({ canvas, userEvent }) => {
    if (!canvas.queryByRole('dialog')) {
      await userEvent.click(canvas.getByRole('button', { name: i18n.t('videos.courses.createTitle') }));
    }
    const dialog = within(await canvas.findByRole('dialog', { name: i18n.t('videos.courses.createTitle') }));
    await expect(dialog.getByRole('heading')).toHaveFocus();
  },
} satisfies Meta<typeof CourseCreateExample>;
export default meta;
type Story = StoryObj<typeof meta>;
type PlayContext = Parameters<NonNullable<Story['play']>>[0];

async function fillForm(context: PlayContext, form = courseForm) {
  await meta.play(context);
  const dialog = within(context.canvas.getByRole('dialog'));
  await context.userEvent.type(dialog.getByRole('textbox', { name: i18n.t('videos.courses.nameLabel') }), form.name);
  if (form.description) {
    await context.userEvent.type(dialog.getByLabelText(i18n.t('videos.courses.descriptionLabel'), { exact: false }), form.description);
  }
  return dialog;
}

export const Initial: Story = {
  play: async context => {
    await meta.play(context);
    const dialog = within(context.canvas.getByRole('dialog'));
    await expect(dialog.getByRole('textbox', { name: i18n.t('videos.courses.nameLabel') })).toHaveValue('');
    await expect(dialog.getByLabelText(i18n.t('videos.courses.descriptionLabel'), { exact: false })).toHaveValue('');
    await expect(dialog.getByRole('button', { name: i18n.t('common.actions.create') })).toBeDisabled();
  },
};
export const Filled: Story = { play: async context => { await fillForm(context); } };
export const DescriptionOptional: Story = {
  play: async context => {
    const dialog = await fillForm(context, { ...courseForm, description: '' });
    await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.create') }));
    await expect(context.args.onCreate).toHaveBeenCalledWith(courseForm.name, '');
    await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument());
  },
};
export const LongFieldsMobile: Story = {
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
  play: async context => { await fillForm(context, longCourseForm); },
};
export const WhitespaceName: Story = {
  play: async context => {
    const dialog = await fillForm(context, { ...courseForm, name: '   ' });
    await expect(dialog.getByRole('button', { name: i18n.t('common.actions.create') })).toBeDisabled();
    await expect(context.args.onCreate).not.toHaveBeenCalled();
  },
};
export const KeyboardCreate: Story = {
  play: async context => {
    await meta.play(context);
    const { canvas, userEvent, args } = context;
    const dialog = within(canvas.getByRole('dialog'));
    await userEvent.tab();
    await expect(dialog.getByRole('textbox', { name: i18n.t('videos.courses.nameLabel') })).toHaveFocus();
    await userEvent.keyboard(`  ${courseForm.name}  `);
    await userEvent.tab();
    await expect(dialog.getByLabelText(i18n.t('videos.courses.descriptionLabel'), { exact: false })).toHaveFocus();
    await userEvent.keyboard(`  ${courseForm.description}  `);
    await userEvent.tab();
    await expect(dialog.getByRole('button', { name: i18n.t('common.actions.cancel') })).toHaveFocus();
    await userEvent.tab();
    await expect(dialog.getByRole('button', { name: i18n.t('common.actions.create') })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onCreate).toHaveBeenCalledWith(courseForm.name, courseForm.description);
    await waitFor(() => expect(canvas.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole('button', { name: i18n.t('videos.courses.createTitle') })).toHaveFocus();
  },
};
export const Creating: Story = {
  args: { onCreate: fn(() => new Promise<void>(() => {})) },
  play: async context => {
    const dialog = await fillForm(context);
    await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.create') }));
    await expect(await dialog.findByRole('button', { name: i18n.t('common.actions.creating') })).toBeDisabled();
    for (const input of dialog.getAllByRole('textbox')) await expect(input).toBeDisabled();
    for (const button of dialog.getAllByRole('button')) await expect(button).toBeDisabled();
    context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(context.canvas.getByRole('dialog')).toBeVisible();
    await expect(context.args.onClose).not.toHaveBeenCalled();
    await expect(context.args.onCreate).toHaveBeenCalledTimes(1);
  },
};
export const CreateFailed: Story = {
  args: { onCreate: fn(async () => { throw new Error(createCourseError); }) },
  play: async context => {
    const dialog = await fillForm(context);
    await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.create') }));
    await expect(await dialog.findByRole('alert')).toHaveTextContent(createCourseError);
    await expect(dialog.getByRole('textbox', { name: i18n.t('videos.courses.nameLabel') })).toHaveValue(courseForm.name);
    await expect(dialog.getByRole('button', { name: i18n.t('common.actions.create') })).toBeEnabled();
    await expect(context.args.onClose).not.toHaveBeenCalled();
  },
};
export const FailureThenRetry: Story = {
  args: { onCreate: fn() },
  beforeEach: ({ args }) => {
    mocked(args.onCreate).mockRejectedValueOnce(new Error(createCourseError)).mockResolvedValue(undefined);
  },
  play: async context => {
    await CreateFailed.play!(context);
    const dialog = within(context.canvas.getByRole('dialog'));
    await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.create') }));
    await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(context.args.onCreate).toHaveBeenCalledTimes(2);
    await expect(context.args.onClose).toHaveBeenCalledTimes(1);
    await meta.play(context);
    const reopened = within(context.canvas.getByRole('dialog'));
    await expect(reopened.queryByRole('alert')).not.toBeInTheDocument();
    for (const input of reopened.getAllByRole('textbox')) await expect(input).toHaveValue('');
  },
};
export const CancelAndReopen: Story = {
  play: async context => {
    const dialog = await fillForm(context);
    await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.cancel') }));
    await expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(context.args.onCreate).not.toHaveBeenCalled();
    await expect(context.args.onClose).toHaveBeenCalledTimes(1);
    await meta.play(context);
    for (const input of within(context.canvas.getByRole('dialog')).getAllByRole('textbox')) await expect(input).toHaveValue('');
  },
};
export const EscapeRequest: Story = {
  parameters: { docs: { description: { story: 'playではネイティブdialogのcancelイベントで閉じる要求を検証します。Canvasで実際のEscapeキーも操作できます。' } } },
  play: async context => {
    await fillForm(context);
    context.canvas.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(context.args.onClose).toHaveBeenCalledTimes(1);
    await expect(context.args.onCreate).not.toHaveBeenCalled();
  },
};
export const EnglishMobile: Story = {
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  play: async context => { await fillForm(context, englishCourseForm); },
};
