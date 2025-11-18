// Learn more: https://github.com/testing-library/jest-dom
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

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key
    },
    i18n: {
      changeLanguage: jest.fn(),
      language: 'en',
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}))

// Mock i18n config
jest.mock('@/i18n/config', () => ({
  initI18n: () => ({
    t: (key, options) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key
    },
    language: 'en',
    changeLanguage: jest.fn(),
  }),
}))

