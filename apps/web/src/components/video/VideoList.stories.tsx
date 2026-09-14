import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import i18n from '@/i18n/config';
import { englishVideo, longVideo, mediaHandlers, mixedVideos, uploadedVideo, youtubeVideo } from '../../../.storybook/fixtures/videos';
import { manyTags } from '../../../.storybook/fixtures/tags';
import { VideoList } from './VideoList';

const meta = {
  title: 'Video/VideoList',
  component: VideoList,
  args: { videos: [uploadedVideo, youtubeVideo, longVideo] },
  parameters: { pathname: '/videos', msw: mediaHandlers },
  decorators: [(Story) => <div className="max-w-4xl"><Story /></div>],
} satisfies Meta<typeof VideoList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Multiple: Story = {};
export const Empty: Story = {
  args: { videos: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(i18n.t('videos.list.noVideos'))).toBeVisible();
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};
export const Single: Story = { args: { videos: [uploadedVideo] } };
export const MixedStatuses: Story = { args: { videos: mixedVideos } };
export const LongTitlesManyTags: Story = {
  args: {
    videos: [
      { ...longVideo, tags: [...longVideo.tags!, ...manyTags.slice(0, 8)] },
      { ...youtubeVideo, title: longVideo.title, tags: manyTags.slice(8, 16) },
    ],
  },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const EnglishMobile: Story = {
  args: {
    videos: [
      englishVideo,
      { ...youtubeVideo, title: 'Coordinate transformations', tags: englishVideo.tags, status: 'processing' },
    ],
  },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
