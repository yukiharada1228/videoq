import { afterEach, vi } from 'vitest'
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
