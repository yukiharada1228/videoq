import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import App from './App';
import i18n from './i18n/config';
import { appQueryClient } from './lib/queryClient';
import { trpc } from './lib/trpc';
import { authFixtures } from '../.storybook/fixtures/auth';
import { emptyTagPage } from '../.storybook/fixtures/api';
import { course, detailVideo } from '../.storybook/fixtures/detail';
import { installUploadFixture } from '../.storybook/mocks/videoUpload';
import { failure, pending, success, trpcQuery } from '../.storybook/mocks/network';
import { studySessionId } from '../.storybook/fixtures/chatPanel';
import { chatRequest, createChatPanelMock } from '../.storybook/mocks/chatPanel';

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
      import('./pages/VideoCoursesPage'), import('./pages/VideoCourseDetailPage'),
      import('./pages/SharePage'), import('./pages/CourseInvitationPage'),
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

export const SharedCourseNotice: Story = {
  parameters: {
    pathname: '/share/linear-algebra',
    api: {
      auth: authFixtures.loggedOut,
      trpc: [trpcQuery('courses.shared', success({
        ...course, updated_at: course.created_at, share_slug: 'linear-algebra', access_role: 'public',
      }))],
    },
  },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(i18n.t('courseSharing.quotaAndHistory'))).toBeVisible();
    await expect(canvas.getByText(i18n.t('courseSharing.link'))).toBeVisible();
  },
};
export const SharedCourseNoticeEnglishMobile: Story = {
  ...SharedCourseNotice,
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

let courseChatNetwork: ReturnType<typeof createChatPanelMock>;
export const CourseChatContinuity: Story = {
  parameters: {
    pathname: `/videos/courses/${course.id}`,
    api: { ...api, trpc: [...api.trpc, trpcQuery('courses.get', success(course))] },
  },
  beforeEach({ parameters, msw }) {
    const mock = createChatPanelMock({ events: [], keepOpen: true });
    courseChatNetwork = mock;
    // Keep the app's account/course tRPC handlers from the common decorator.
    msw.use(...mock.handlers.filter(({ info }) => info.path === '/api/chat/messages/stream'));
    const scope = parameters.pathname.startsWith('/share/') ? 'share:linear-algebra' : `course:${course.id}`;
    const key = `plog-study-session:${scope}`;
    const saved = sessionStorage.getItem(key);
    sessionStorage.setItem(key, studySessionId);
    return () => {
      mock.dispose();
      if (saved === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, saved);
    };
  },
  async play({ canvasElement, userEvent, parameters }) {
    const canvas = within(canvasElement);
    const shared = parameters.pathname.startsWith('/share/');
    const mobile = window.innerWidth < 1024;
    const english = i18n.language.startsWith('en');
    const original = english ? 'Study rotation matrices' : '回転行列を学ぶ';
    const restarted = english ? 'Ask me the first question' : '最初の問いをお願いします';
    const reply = english ? 'Explain the relationship between input and output.' : '入力と出力の関係を説明してください。';
    const draft = english ? 'The length does not change.' : '長さは変わりません。';
    const input = await canvas.findByRole('textbox', { name: i18n.t('chat.placeholder') });
    // Include CSS-hidden panels: two separately mounted chats lose state on resize.
    await expect(canvas.getAllByRole('textbox', { hidden: true })).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('chat.modeStudy') }));
    const finish = async (status: 'started' | 'continued') => {
      await waitFor(() => expect(courseChatNetwork.activeStreams).toBe(1));
      courseChatNetwork.emit([{ type: 'content_chunk', text: reply }, {
        type: 'done', chat_log_id: 101, feedback: null,
        study_session: { status, expires_at: Date.now() + 43_200_000 },
      }]);
      courseChatNetwork.finish();
      await waitFor(() => expect(input).toBeEnabled(), { timeout: 10000 });
      await expect(canvas.getByText(reply)).toBeVisible();
    };
    const send = async (text: string, count: number) => {
      await userEvent.type(input, text);
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(chatRequest).toHaveBeenCalledTimes(count));
    };
    const changeMobileTab = async (tab: 'videos' | 'player') => {
      await userEvent.click(canvas.getByRole('button', {
        name: i18n.t(shared ? `videos.shared.tabs.${tab}` : `videos.courseDetail.mobileTabs.${tab}`),
      }));
      await expect(canvas.getByRole('textbox', { hidden: true })).toBe(input);
      if (tab === 'videos') await expect(input).not.toBeVisible();
      else await expect(input).toBeVisible();
    };
    await send(original, 1);
    await expect(chatRequest.mock.calls[0][0]).toMatchObject({ course_id: course.id, study_session_id: studySessionId, mode: 'study' });
    await finish('continued');
    const restart = canvas.getByRole('button', { name: i18n.t('chat.studySession.restart') });
    restart.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(within(canvas.getByRole('dialog')).getByRole('button', { name: i18n.t('chat.studySession.restart') }));
    await waitFor(() => expect(restart).toHaveFocus());
    await expect(canvas.queryByText(original)).not.toBeInTheDocument();
    await send(restarted, 2);
    const request = chatRequest.mock.calls[1][0];
    await expect(request.study_session_id).not.toBe(studySessionId);
    await expect(request.share_slug).toBe(shared ? 'linear-algebra' : undefined);
    await expect(request.messages).toEqual([{ role: 'user', content: restarted }]);
    if (mobile) {
      await changeMobileTab('videos');
      await changeMobileTab('player');
      await expect(input).toBeDisabled();
    }
    await finish('started');
    await userEvent.type(input, draft);
    if (mobile) {
      await changeMobileTab('videos');
      await changeMobileTab('player');
    }
    await expect(input).toHaveValue(draft);
    await expect(canvas.getByText(restarted)).toBeVisible();
    await expect(canvas.getByRole('button', { name: i18n.t('chat.modeStudy') })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText(i18n.t('chat.studySession.started'))).toBeVisible();
  },
};
export const CourseChatContinuityMobile: Story = {
  ...CourseChatContinuity, globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const CourseChatContinuityEnglish: Story = { ...CourseChatContinuity, globals: { locale: 'en' } };
export const CourseChatContinuityEnglishMobile: Story = {
  ...CourseChatContinuity, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
export const SharedChatContinuity: Story = { ...CourseChatContinuity, parameters: SharedCourseNotice.parameters };
export const SharedChatContinuityMobile: Story = { ...CourseChatContinuityMobile, parameters: SharedCourseNotice.parameters };
export const SharedChatContinuityEnglish: Story = { ...CourseChatContinuityEnglish, parameters: SharedCourseNotice.parameters };
export const SharedChatContinuityEnglishMobile: Story = { ...CourseChatContinuityEnglishMobile, parameters: SharedCourseNotice.parameters };

export const InvitationNotice: Story = {
  parameters: {
    pathname: '/course-invitations/sample-invitation',
    api: {
      auth: authFixtures.loggedOut,
      trpc: [trpcQuery('courseMemberships.preview', success({
        course_id: course.id, course_name: course.name, inviter_name: 'Teacher',
        email_hint: 's*****t@example.com', status: 'pending', expires_at: '2026-10-01T00:00:00Z',
      }))],
    },
  },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(i18n.t('courseSharing.invitation'))).toBeVisible();
    await expect(canvas.getByText(i18n.t('courseSharing.quotaAndHistory'))).toBeVisible();
    await expect(canvas.getByRole('link', { name: i18n.t('courseInvitation.login') })).toBeVisible();
  },
};
export const InvitationNoticeEnglishMobile: Story = {
  ...InvitationNotice,
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

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

export const CoursesCaseInsensitive: Story = {
  parameters: { pathname: '/videos/COURSES' },
  async play({ canvasElement, userEvent, globals }) {
    const canvas = within(canvasElement);
    const heading = await canvas.findByRole('heading', { level: 1, name: i18n.t('videos.courses.title') });
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    const main = canvas.getByRole('main');
    const footer = canvas.getByRole('contentinfo');
    await expect(heading.getBoundingClientRect().left).toBeGreaterThan(0);
    if (globals.viewport?.value === 'mobile') {
      await userEvent.click(within(header).getByRole('button', { name: i18n.t('navigation.menu') }));
    }
    await expect(within(header).getByRole('link', { name: i18n.t('navigation.coursesNav') })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(header).getByRole('link', { name: i18n.t('navigation.home') }));
    await canvas.findByRole('heading', { level: 1, name: i18n.t('home.welcome.greeting', { username: api.auth.profile!.username }) });
    await expect(canvas.getByRole('link', { name: 'VideoQ' }).closest('header')).toBe(header);
    await expect(canvas.getByRole('main')).toBe(main);
    await expect(canvas.getByRole('contentinfo')).toBe(footer);
  },
};
export const CoursesCaseInsensitiveEnglishMobile: Story = {
  ...CoursesCaseInsensitive,
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
  async beforeEach() {
    // Model an authenticated visitor before holding the content request open.
    // Otherwise a warm route can batch account.me with the pending fixture.
    await appQueryClient.fetchQuery(trpc.account.me.queryOptions());
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

export const EncodedLocaleVideoMobile: Story = {
  ...VideoMobileLayout,
  // Start in Japanese; the encoded URL must select English before rendering the page.
  globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } },
  parameters: { ...VideoMobileLayout.parameters, pathname: '/%65n/videos/7' },
  async play(context) {
    await VideoMobileLayout.play!(context);
    const canvas = within(context.canvasElement);
    const header = canvas.getByRole('link', { name: 'VideoQ' }).closest('header')!;
    const main = canvas.getByRole('main');
    await expect(i18n.language).toBe('en');
    await context.userEvent.click(within(header).getByRole('button', { name: i18n.t('navigation.menu') }));
    await expect(within(header).getByRole('link', { name: i18n.t('navigation.videoLibrary') })).toHaveAttribute('aria-current', 'page');
    await context.userEvent.click(within(header).getByRole('link', { name: i18n.t('navigation.home') }));
    await canvas.findByRole('heading', { level: 1, name: i18n.t('home.welcome.greeting', { username: api.auth.profile!.username }) });
    await expect(canvas.getByRole('link', { name: 'VideoQ' }).closest('header')).toBe(header);
    await expect(canvas.getByRole('main')).toBe(main);
    await expect(canvas.getByRole('contentinfo')).toBeInTheDocument();
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
