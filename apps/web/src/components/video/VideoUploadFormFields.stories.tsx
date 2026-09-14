import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn } from 'storybook/test';
import i18n from '@/i18n/config';
import { VideoUploadFormFields } from './VideoUploadFormFields';

function UploadFormExample(args: ComponentProps<typeof VideoUploadFormFields>) {
  const [title, setTitle] = useState(args.title);
  const [description, setDescription] = useState(args.description);
  return (
    <form className="space-y-4" style={{ maxWidth: 560 }} onSubmit={(event) => event.preventDefault()}>
      <VideoUploadFormFields
        {...args}
        title={title}
        description={description}
        setTitle={(value) => { args.setTitle(value); setTitle(value); }}
        setDescription={(value) => { args.setDescription(value); setDescription(value); }}
      />
    </form>
  );
}

const meta = {
  title: 'Video/VideoUploadFormFields',
  component: VideoUploadFormFields,
  args: {
    title: '',
    description: '',
    isUploading: false,
    progress: 0,
    disabled: false,
    error: null,
    warning: null,
    success: false,
    setTitle: fn(),
    setDescription: fn(),
    handleFileChange: fn(),
    onCancel: fn(),
  },
  render: (args) => <UploadFormExample key={JSON.stringify([args.title, args.description])} {...args} />,
} satisfies Meta<typeof VideoUploadFormFields>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { title: '線形代数 第3回：回転行列', description: '座標変換の基本と回転行列の具体例を解説する講義です。' } };
export const Disabled: Story = { args: { ...Filled.args, disabled: true } };
export const StartingUpload: Story = { args: { ...Filled.args, isUploading: true, progress: 0 } };
export const Uploading: Story = { args: { ...Filled.args, isUploading: true, progress: 46 } };
export const UploadComplete: Story = { args: { ...Filled.args, isUploading: true, progress: 100 } };
export const Error: Story = { args: { ...Filled.args, error: 'videos.upload.validation.fileTooLarge', errorParams: { max_size_mb: 500 } } };
export const StorageLimitError: Story = { args: { error: 'videos.upload.validation.storageLimitExceeded' } };
export const Warning: Story = { args: { ...Filled.args, warning: 'videos.upload.warning.tagsFailed', success: true } };
export const Success: Story = { args: { ...Filled.args, success: true } };
export const WithCancel: Story = {
  args: { showCancelButton: true },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('common.actions.cancel') }));
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};
export const FillForm: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const [title, description] = canvas.getAllByRole('textbox');
    await userEvent.type(title, '線形代数の講義');
    await userEvent.type(description, '回転行列の解説');
    await expect(title).toHaveValue('線形代数の講義');
    await expect(description).toHaveValue('回転行列の解説');
    const file = new File(['storybook input fixture'], 'lecture.mp4', { type: 'video/mp4' });
    await userEvent.upload(canvas.getByLabelText(i18n.t('videos.upload.fileLabel'), { exact: false }), file);
    await expect(args.handleFileChange).toHaveBeenCalledTimes(1);
  },
};
export const EnglishMobile: Story = {
  args: { title: 'Linear algebra: rotation matrices', description: 'A lecture about coordinate transformations.', isUploading: true, progress: 46 },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
