import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import React from 'react'

declare global {
  interface GlobalThis {
    __setMockPathname: (pathname: string) => void
  }
}

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock React Router
const mockNavigate = vi.fn()
const mockLocation: {
  pathname: string
  search: string
  hash: string
  state: unknown
  key: string
} = { pathname: '/', search: '', hash: '', state: null, key: 'default' }

// Allow tests to control the (de-localized) pathname returned by useLocation/useI18nLocation
globalThis.__setMockPathname = (pathname: string) => {
  mockLocation.pathname = pathname
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  type MockLinkProps = {
    children?: React.ReactNode
    to?: unknown
  } & Record<string, unknown>
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Link: ({ children, to, ...props }: MockLinkProps) =>
      React.createElement('a', { href: typeof to === 'string' ? to : '', ...props }, children),
  }
})

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children,
  I18nextProvider: ({ children }: { children?: React.ReactNode }) => children,
}))

// Mock i18n routing helpers
vi.mock('@/lib/i18n', () => ({
  useI18nNavigate: () => mockNavigate,
  useI18nLocation: () => mockLocation,
  removeLocalePrefix: (pathname: string) => pathname,
  addLocalePrefix: (pathname: string) => pathname,
  useLocale: () => 'en',
  Link: ({ children, to, href, ...props }: { children?: React.ReactNode; to?: unknown; href?: string } & Record<string, unknown>) =>
    React.createElement('a', { href: href || (typeof to === 'string' ? to : ''), ...props }, children),
  i18nConfig: {
    locales: ['en', 'ja'],
    defaultLocale: 'en',
  },
}))

// Helper function for getVideoUrl within the mock
const mockGetVideoUrl = (videoFilePath: string | null): string => {
  if (!videoFilePath) return '';
  if (videoFilePath.startsWith('http://') || videoFilePath.startsWith('https://')) return videoFilePath;
  // Prevent double /api/ when path already starts with /api/
  if (videoFilePath.startsWith('/api/')) {
    return `http://localhost:8000${videoFilePath}`;
  }
  return `http://localhost:8000/api/${videoFilePath}`;
};

// Helper function for getSharedVideoUrl within the mock
const mockGetSharedVideoUrl = (videoFilePath: string | null, shareToken: string): string => {
  if (!videoFilePath) return '';
  const baseUrl = mockGetVideoUrl(videoFilePath); // Use the local helper
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}share_token=${shareToken}`;
};

// Mock useConfig hook so individual test api mocks don't need getConfig
vi.mock('@/hooks/useConfig', () => ({
  useConfig: () => ({
    config: { billing_enabled: true, signup_enabled: true },
    loading: false,
  }),
}))

// Mock the API client
vi.mock('@/lib/api', () => ({
  apiClient: {
    getConfig: vi.fn(() => Promise.resolve({ billing_enabled: true, signup_enabled: true })),
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    getMeSafe: vi.fn(() => Promise.resolve(null)),
    logout: vi.fn(() => Promise.resolve()),
    signup: vi.fn(() => Promise.resolve()),
    verifyEmail: vi.fn(() => Promise.resolve()),
    requestPasswordReset: vi.fn(() => Promise.resolve()),
    confirmPasswordReset: vi.fn(() => Promise.resolve()),
    login: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    getVideoGroups: vi.fn(() => Promise.resolve([])),
    getSharedVideoGroup: vi.fn(() => Promise.resolve(null)),
    createVideoGroup: vi.fn(() => Promise.resolve({ id: '1', name: 'New Group', description: 'Description', videos: [] })),
    updateVideoGroup: vi.fn(() => Promise.resolve()),
    deleteVideoGroup: vi.fn(() => Promise.resolve()),
    getVideos: vi.fn(() => Promise.resolve([])),
    updateVideo: vi.fn(() => Promise.resolve()),
    deleteVideo: vi.fn(() => Promise.resolve()),
    chat: vi.fn(() => Promise.resolve({ response: 'Mock chat response' })),
    getVideoUrl: vi.fn(mockGetVideoUrl),
    getSharedVideoUrl: vi.fn(mockGetSharedVideoUrl),
  },
}));

// Patch missing common API methods on the mock before each test.
// This handles the case where individual test files override the @/lib/api mock
// without including methods like getMeSafe/logout that hooks (useAuth) need.
beforeEach(async () => {
  try {
    const mod = await import('@/lib/api')
    const client = (mod as any).apiClient
    if (client) {
      const defaults: Record<string, () => unknown> = {
        getMeSafe: () => Promise.resolve(null),
        getConfig: () => Promise.resolve({ billing_enabled: true, signup_enabled: true }),
        logout: () => Promise.resolve(),
      }
      for (const [name, impl] of Object.entries(defaults)) {
        if (typeof client[name] !== 'function') {
          client[name] = vi.fn(impl)
        }
      }
    }
  } catch { /* ignore */ }
})