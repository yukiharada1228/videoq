import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import App from './App';
import i18n from './i18n/config';
import { authFixtures } from '../.storybook/fixtures/auth';
import { emptyTagPage } from '../.storybook/fixtures/api';
import { detailVideo } from '../.storybook/fixtures/detail';
import { installUploadFixture } from '../.storybook/mocks/videoUpload';
import { failure, pending, success, trpcQuery } from '../.storybook/mocks/network';

const emptyPage = { data: [], meta: { total: 0, limit: 24, offset: 0 } };
const api = {
  auth: authFixtures.user,
  trpc: [
    trpcQuery('billing.plans', success([])),
    trpcQuery('videos.list', success(emptyPage)),
    trpcQuery('courses.list', success(emptyPage)),
    trpcQuery('tags.list', success(emptyTagPage)),
    trpcQuery('videos.statusCounts', success({
      total: 0, completed: 0, pending: 0, processing: 0, indexing: 0, error: 0, uploading: 0,
    })),
  ],
};

const meta = {
  title: 'Application/Navigation',
  component: App,
  globals: { viewport: { value: 'desktop', isRotated: false } },
  parameters: { layout: 'fullscreen', pathname: '/pricing', api, docs: { story: { inline: false, height: '900px' } } },
  async beforeEach() {
    // Browser stories verify layout and interactions. The navigation unit test
    // controls lazy-module delays explicitly; await cold Vite imports here.
    await Promise.all([
      import('./pages/HomePage'), import('./pages/PricingPage'),
      import('./pages/LoginPage'), import('./pages/SignupPage'),
      import('./pages/VideoLibraryPage'), import('./pages/VideoDetailPage'),
      import('./pages/VideoCourseDetailPage'),
    ]);
    const cleanupUpload = installUploadFixture({});
    const saved = localStorage.getItem('videoq.locale');
    localStorage.removeItem('videoq.locale');
    return () => {
      cleanupUpload();
      if (saved === null) localStorage.removeItem('videoq.locale');
      else localStorage.setItem('videoq.locale', saved);
    };
  },
} satisfies Meta<typeof App>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HomeNavigation: Story = {
  async play({ canvasElement, userEvent, globals }) {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { level: 1, name: i18n.t('pricing.title') });
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    const footer = canvas.getByRole('contentinfo');
    const main = canvas.getByRole('main');
    const mobile = globals.viewport?.value === 'mobile';
    if (mobile) {
      const trigger = within(header).getByRole('button', { name: i18n.t('navigation.menu') });
      trigger.focus();
      await userEvent.keyboard('{Enter}');
    }
    await userEvent.click(within(header).getByRole('link', { name: i18n.t('navigation.home') }));
    await canvas.findByRole('heading', { level: 1, name: i18n.t('home.welcome.greeting', { username: api.auth.profile!.username }) });
    await expect(canvas.getByRole('link', { name: 'VideoQ' }).closest('header')).toBe(header);
    await expect(canvas.getByRole('contentinfo')).toBe(footer);
    await expect(canvas.getByRole('main')).toBe(main);
    if (mobile) await userEvent.click(within(header).getByRole('button', { name: i18n.t('navigation.menu') }));
    await expect(within(header).getByRole('link', { name: i18n.t('navigation.home') })).toHaveAttribute('aria-current', 'page');
  },
};
export const HomeNavigationMobile: Story = {
  ...HomeNavigation,
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const HomeNavigationEnglish: Story = { ...HomeNavigation, globals: { locale: 'en' } };
export const HomeNavigationEnglishMobile: Story = {
  ...HomeNavigation,
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const HomeDataPending: Story = {
  parameters: { api: { ...api, trpc: api.trpc.map((mock) => mock.path === 'videos.list' ? trpcQuery('videos.list', pending()) : mock) } },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { level: 1, name: i18n.t('pricing.title') });
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    const footer = canvas.getByRole('contentinfo');
    await userEvent.click(within(header).getByRole('link', { name: i18n.t('navigation.home') }));
    await within(canvas.getByRole('main')).findByText('Loading');
    const trigger = within(header).getByRole('button', { name: i18n.t('navigation.menu') });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(header).toBeVisible();
    await expect(canvas.getByRole('contentinfo')).toBe(footer);
  },
};

export const LeavePendingHome: Story = {
  ...HomeDataPending,
  async play(context) {
    await HomeDataPending.play!(context);
    const { canvasElement, userEvent } = context;
    const canvas = within(canvasElement);
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    // Close the menu and navigate using the desktop link.
    await userEvent.click(within(header).getByRole('button', { name: i18n.t('navigation.closeMenu'), expanded: true }));
    await userEvent.click(within(header).getByRole('link', { name: i18n.t('navigation.pricing') }));
    await canvas.findByRole('heading', { level: 1, name: i18n.t('pricing.title') });
    await expect(header).toBeVisible();
    await expect(within(header).getByRole('link', { name: i18n.t('navigation.pricing') })).toHaveAttribute('aria-current', 'page');
  },
};

export const FailedLibrary: Story = {
  parameters: {
    pathname: '/videos',
    api: { ...api, trpc: api.trpc.map((mock) => mock.path === 'videos.list' ? trpcQuery('videos.list', failure('動画の取得に失敗しました')) : mock) },
  },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    await canvas.findByText('動画の取得に失敗しました');
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    await userEvent.click(within(header).getByRole('link', { name: i18n.t('navigation.pricing') }));
    await canvas.findByRole('heading', { level: 1, name: i18n.t('pricing.title') });
    await expect(header).toBeVisible();
  },
};

export const AuthNavigation: Story = {
  parameters: { pathname: '/login', api: { ...api, auth: authFixtures.loggedOut } },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { level: 1, name: i18n.t('auth.login.title') });
    const header = canvas.getByRole('banner');
    const main = canvas.getByRole('main');
    await userEvent.click(canvas.getByRole('link', { name: i18n.t('auth.login.footerLink') }));
    await canvas.findByRole('heading', { level: 1, name: i18n.t('auth.signup.title') });
    await expect(canvas.getByRole('banner')).toBe(header);
    await expect(canvas.getByRole('main')).toBe(main);
    await waitFor(() => expect(canvas.queryByRole('navigation', { name: i18n.t('navigation.menu') })).not.toBeInTheDocument());
  },
};

export const PendingVideo: Story = {
  parameters: {
    pathname: '/videos/7',
    api: { ...api, trpc: [...api.trpc, trpcQuery('videos.get', pending())] },
  },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    await within(canvas.getByRole('main')).findByText('Loading');
    await expect(canvas.queryByRole('contentinfo')).not.toBeInTheDocument();
    await userEvent.click(within(header).getByRole('link', { name: i18n.t('navigation.home') }));
    await canvas.findByRole('heading', { level: 1, name: i18n.t('home.welcome.greeting', { username: api.auth.profile!.username }) });
    await expect(header).toBeVisible();
    await expect(canvas.getByRole('contentinfo')).toBeInTheDocument();
  },
};
export const PendingCourse: Story = {
  ...PendingVideo,
  parameters: {
    pathname: '/videos/courses/7',
    api: { ...api, trpc: [...api.trpc, trpcQuery('courses.get', pending())] },
  },
};

export const VideoMobileLayout: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: {
    pathname: '/videos/7',
    api: { ...api, trpc: [...api.trpc, trpcQuery('videos.get', success({ ...detailVideo, status: 'processing' }))] },
  },
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    const transcriptTab = await canvas.findByRole('button', { name: i18n.t('videos.detail.transcriptSection') });
    const tabs = transcriptTab.parentElement!;
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    await expect(tabs.getBoundingClientRect().left).toBe(0);
    await expect(tabs.getBoundingClientRect().width).toBe(canvasElement.ownerDocument.documentElement.clientWidth);
    await expect(tabs.getBoundingClientRect().top).toBe(header.getBoundingClientRect().bottom);
    await userEvent.click(transcriptTab);
    await expect(header).toBeVisible();
    await expect(canvas.getAllByRole('main')).toHaveLength(1);
    await expect(canvas.queryByRole('contentinfo')).not.toBeInTheDocument();
  },
};

export const LoggedOutHome: Story = {
  parameters: { pathname: '/', api: { ...api, auth: authFixtures.loggedOut } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { level: 1, name: i18n.t('landing.title') });
    await expect(canvas.getAllByRole('main')).toHaveLength(1);
    await expect(canvas.getAllByRole('contentinfo')).toHaveLength(1);
  },
};
