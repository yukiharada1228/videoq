import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import React from 'react'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock React Router
const mockNavigate = vi.fn()
const mockLocation = { pathname: '/', search: '', hash: '', state: null, key: 'default' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Link: ({ children, to, ...props }: any) =>
      React.createElement('a', { href: typeof to === 'string' ? to : '', ...props }, children),
  }
})

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
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
  Trans: ({ children }: any) => children,
  I18nextProvider: ({ children }: any) => children,
}))

// Mock i18n routing helpers
vi.mock('@/lib/i18n', () => ({
  useI18nNavigate: () => mockNavigate,
  useI18nLocation: () => mockLocation,
  useLocale: () => 'en',
  Link: ({ children, to, ...props }: any) =>
    React.createElement('a', { href: typeof to === 'string' ? to : '', ...props }, children),
  i18nConfig: {
    locales: ['en', 'ja'],
    defaultLocale: 'en',
  },
}))
