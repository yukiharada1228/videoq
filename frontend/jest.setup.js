// Learn more: https://github.com/testing-library/jest-dom
import React from 'react'
import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  usePathname() {
    return '/'
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key, options) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key
    }
    t.rich = (key, options) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key
    }
    return t
  },
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }) => children,
}))

// Mock next-intl routing
jest.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }) =>
    React.createElement('a', { href, ...props }, children),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  redirect: jest.fn(),
  routing: {
    locales: ['en', 'ja'],
    defaultLocale: 'en',
  },
}))

