import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import i18n from '@/i18n/config';

// Exercise the real router, translated links, and persistent layout together.
vi.unmock('react-router-dom');
vi.unmock('react-i18next');
vi.unmock('@/lib/i18n');
vi.unmock('@/components/layout/AppNav');

const homeModule = vi.hoisted(() => {
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => { finish = resolve; });
  return { ready, finish, requested: false };
});
vi.mock('@/pages/HomePage', async (importOriginal) => {
  homeModule.requested = true;
  await homeModule.ready;
  return importOriginal();
});

const renderFailure = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/pages/LegalPage', async (importOriginal) => {
  const { default: LegalPage } = await importOriginal<typeof import('@/pages/LegalPage')>();
  return {
    default: (props: React.ComponentProps<typeof LegalPage>) => {
      if (renderFailure.enabled) throw new Error('Page render failed');
      return <LegalPage {...props} />;
    },
  };
});

const profile = { id: '1', username: 'testuser', is_superuser: false };
const emptyPage = { data: [], meta: { total: 0, limit: 24, offset: 0 } };
const getAccount = vi.fn();
const listVideos = vi.fn();
const listCourses = vi.fn();

beforeAll(async () => {
  // Only HomePage's module delay is under test. Prepare other modules before
  // testing API delays so cold transforms cannot consume assertion timeouts.
  await Promise.all([
    import('@/pages/PricingPage'), import('@/pages/VideoLibraryPage'),
    import('@/pages/VideoCoursesPage'), import('@/pages/VideoDetailPage'),
    import('@/pages/VideoCourseDetailPage'), import('@/pages/AdminPage'),
    import('@/pages/LoginPage'), import('@/pages/SignupPage'), import('@/pages/LegalPage'),
  ]);
});

afterEach(() => { homeModule.finish(); });

beforeEach(async () => {
  localStorage.removeItem('videoq.locale');
  await i18n.changeLanguage('ja');
  renderFailure.enabled = false;
  getAccount.mockReset().mockResolvedValue(profile);
  listVideos.mockReset().mockResolvedValue(emptyPage);
  listCourses.mockReset().mockResolvedValue(emptyPage);
  globalThis.__setTrpcHandler('account.me', getAccount);
  globalThis.__setTrpcHandler('videos.list', listVideos);
  globalThis.__setTrpcHandler('courses.list', listCourses);
  globalThis.__setTrpcHandler('billing.plans', () => []);
  globalThis.__setTrpcHandler('tags.list', () => emptyPage);
  globalThis.__setTrpcHandler('videos.statusCounts', () => ({
    total: 0, completed: 0, pending: 0, processing: 0, indexing: 0, error: 0, uploading: 0,
  }));
});

function renderApp(path = '/pricing') {
  window.history.replaceState(null, '', path);
  return render(<BrowserRouter><App /></BrowserRouter>);
}

function primaryNav() {
  return screen.getAllByRole('navigation', { name: i18n.t('navigation.menu') })[0];
}

function homeLink() {
  return within(primaryNav()).getByRole('link', { name: i18n.t('navigation.home') });
}

it('keeps the same layout and intercepts navigation while the home module loads', async () => {
  renderApp();
  await screen.findByRole('heading', { name: i18n.t('pricing.title'), level: 1 });
  const nav = primaryNav();
  const header = nav.closest('header')!;
  const footer = screen.getByRole('contentinfo');

  // A cancelled anchor default proves the router handled this instead of a document navigation.
  expect(fireEvent.click(homeLink())).toBe(false);
  await waitFor(() => expect(homeModule.requested).toBe(true));
  expect(window.location.pathname).toBe('/');
  expect(within(screen.getByRole('main')).getByText('Loading')).toBeInTheDocument();
  expect(primaryNav()).toBe(nav);
  expect(homeLink()).toHaveAttribute('aria-current', 'page');
  const menuButton = within(header).getByRole('button', { name: i18n.t('navigation.menu') });
  fireEvent.click(menuButton);

  await act(async () => { homeModule.finish(); });
  await screen.findByRole('heading', { name: i18n.t('home.welcome.greeting', { username: profile.username }), level: 1 });
  expect(primaryNav()).toBe(nav);
  expect(screen.getByRole('contentinfo')).toBe(footer);
  expect(menuButton).toHaveAttribute('aria-expanded', 'true');
});

it.each(['account', 'videos', 'courses'] as const)(
  'keeps navigation usable while %s data is pending, then preserves the open menu',
  async (resource) => {
    const handler = { account: getAccount, videos: listVideos, courses: listCourses }[resource];
    let finish!: (value: unknown) => void;
    handler.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderApp('/');
    await waitFor(() => expect(handler).toHaveBeenCalled());
    const nav = primaryNav();
    const footer = screen.getByRole('contentinfo');
    expect(within(screen.getByRole('main')).getByText('Loading')).toBeInTheDocument();
    const trigger = within(nav.closest('header')!).getByRole('button', { name: i18n.t('navigation.menu') });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await act(async () => { finish(resource === 'account' ? profile : emptyPage); });
    await screen.findByRole('heading', { name: i18n.t('home.welcome.greeting', { username: profile.username }), level: 1 });
    expect(primaryNav()).toBe(nav);
    expect(screen.getByRole('contentinfo')).toBe(footer);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
);

it.each(['ja', 'en'] as const)('preserves the layout across standard pages and highlights the current route (%s)', async (locale) => {
  await i18n.changeLanguage(locale);
  renderApp(locale === 'en' ? '/en/pricing' : '/pricing');
  await screen.findByRole('heading', { name: i18n.t('pricing.title'), level: 1 });
  const nav = primaryNav();
  const footer = screen.getByRole('contentinfo');
  for (const [label, path, title] of [
    ['navigation.home', '/', 'home.welcome.greeting'],
    ['navigation.videoLibrary', '/videos', 'videos.list.title'],
    ['navigation.coursesNav', '/videos/courses', 'videos.courses.title'],
    ['navigation.pricing', '/pricing', 'pricing.title'],
  ]) {
    const link = within(nav).getByRole('link', { name: i18n.t(label) });
    expect(fireEvent.click(link)).toBe(false);
    await screen.findByRole('heading', { name: i18n.t(title, { username: profile.username }), level: 1 });
    expect(window.location.pathname).toBe(locale === 'en' ? `/en${path}` : path);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(primaryNav()).toBe(nav);
    expect(screen.getByRole('contentinfo')).toBe(footer);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  }
});

it('keeps navigation available after an API failure and allows leaving the page', async () => {
  listVideos.mockRejectedValue(new Error('Network error'));
  renderApp('/videos');
  await screen.findByText('Network error');
  const nav = primaryNav();
  expect(fireEvent.click(within(nav).getByRole('link', { name: i18n.t('navigation.pricing') }))).toBe(false);
  await screen.findByRole('heading', { name: i18n.t('pricing.title'), level: 1 });
  expect(primaryNav()).toBe(nav);
});

it('keeps the search input mounted and focused when query parameters change', async () => {
  renderApp('/videos');
  const input = await screen.findByRole('searchbox', { name: i18n.t('videos.list.searchPlaceholder') });
  input.focus();
  fireEvent.change(input, { target: { value: 'matrix' } });
  await waitFor(() => expect(window.location.search).toBe('?q=matrix'));
  expect(screen.getByRole('searchbox', { name: i18n.t('videos.list.searchPlaceholder') })).toBe(input);
  expect(input).toHaveFocus();
  expect(input).toHaveValue('matrix');
});

it.each([
  ['/videos/7', 'videos.get', 'navigation.videoLibrary'],
  ['/videos/courses/7', 'courses.get', 'navigation.coursesNav'],
])('keeps the header when leaving a pending workspace at %s', async (path, procedure, activeLabel) => {
  const load = vi.fn(() => new Promise(() => {}));
  globalThis.__setTrpcHandler(procedure, load);
  renderApp(path);
  await waitFor(() => expect(load).toHaveBeenCalled());
  const nav = primaryNav();
  const main = screen.getByRole('main');
  expect(within(nav).getByRole('link', { name: i18n.t(activeLabel) })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  expect(within(main).getByText('Loading')).toBeInTheDocument();
  fireEvent.click(homeLink());
  await screen.findByRole('heading', { name: i18n.t('home.welcome.greeting', { username: profile.username }), level: 1 });
  expect(primaryNav()).toBe(nav);
  expect(screen.getByRole('main')).toBe(main);
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();
});

it('keeps the admin layout visible during the authentication check', async () => {
  getAccount.mockReturnValue(new Promise(() => {}));
  renderApp('/admin');
  await waitFor(() => expect(getAccount).toHaveBeenCalled());
  const nav = primaryNav();
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  expect(within(screen.getByRole('main')).getByText('Loading')).toBeInTheDocument();
  fireEvent.click(homeLink());
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(primaryNav()).toBe(nav);
});

it('keeps one authentication layout across login and signup', async () => {
  globalThis.__setMockAuthSession(null);
  renderApp('/login');
  await screen.findByRole('heading', { name: i18n.t('auth.login.title'), level: 1 });
  const header = screen.getByRole('banner');
  const main = screen.getByRole('main');
  fireEvent.click(screen.getByRole('link', { name: i18n.t('auth.login.footerLink') }));
  await screen.findByRole('heading', { name: i18n.t('auth.signup.title'), level: 1 });
  expect(window.location.pathname).toBe('/signup');
  expect(screen.getByRole('banner')).toBe(header);
  expect(screen.getByRole('main')).toBe(main);
  expect(screen.queryByRole('navigation', { name: i18n.t('navigation.menu') })).not.toBeInTheDocument();
});

it('contains a page render error inside the layout and recovers on navigation', async () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    renderFailure.enabled = true;
    renderApp('/privacy');
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('common.messages.pageLoadFailed'));
    const nav = primaryNav();
    const footer = screen.getByRole('contentinfo');
    fireEvent.click(homeLink());
    await screen.findByRole('heading', { name: i18n.t('home.welcome.greeting', { username: profile.username }), level: 1 });
    expect(primaryNav()).toBe(nav);
    expect(screen.getByRole('contentinfo')).toBe(footer);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    errorLog.mockRestore();
  }
});
