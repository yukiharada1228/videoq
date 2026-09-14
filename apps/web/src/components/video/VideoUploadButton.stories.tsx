import type { Meta, StoryObj } from '@storybook/react-vite';
import { VideoUploadButton } from './VideoUploadButton';

const meta = {
  title: 'Video/VideoUploadButton',
  component: VideoUploadButton,
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
  args: { isUploading: false },
} satisfies Meta<typeof VideoUploadButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Uploading: Story = { args: { isUploading: true } };
export const WithProgress: Story = { args: { isUploading: true, progress: 46 } };
export const Outline: Story = { args: { variant: 'outline' } };
export const FullWidth: Story = { args: { fullWidth: true } };
export const FullWidthUploading: Story = { args: { fullWidth: true, isUploading: true, progress: 46 } };
