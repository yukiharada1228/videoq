import { render } from '@testing-library/react'
import { I18nProvider } from '../I18nProvider'
import { initI18n } from '@/i18n/config'

// Mock i18n config
const mockI18nInstance = {
  language: 'en',
  on: jest.fn(),
  off: jest.fn(),
}

jest.mock('@/i18n/config', () => ({
  initI18n: jest.fn(() => mockI18nInstance),
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  I18nextProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="i18next-provider">{children}</div>
  ),
}))

describe('I18nProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock document
    Object.defineProperty(document, 'documentElement', {
      value: { lang: '' },
      writable: true,
    })
  })

  it('should render children', () => {
    const { getByTestId } = render(
      <I18nProvider>
        <div>Test Content</div>
      </I18nProvider>
    )
    
    expect(getByTestId('i18next-provider')).toBeInTheDocument()
  })

  it('should initialize i18n instance', () => {
    render(
      <I18nProvider>
        <div>Test</div>
      </I18nProvider>
    )
    
    expect(initI18n).toHaveBeenCalled()
  })

  it('should set document language on mount', () => {
    render(
      <I18nProvider>
        <div>Test</div>
      </I18nProvider>
    )
    
    expect(document.documentElement.lang).toBe('en')
  })

  it('should register language change handler', () => {
    render(
      <I18nProvider>
        <div>Test</div>
      </I18nProvider>
    )
    
    expect(mockI18nInstance.on).toHaveBeenCalledWith('languageChanged', expect.any(Function))
  })

  it('should update document language when language changes', () => {
    let languageChangeHandler: ((lng: string) => void) | undefined
    
    mockI18nInstance.on.mockImplementation((event: string, handler: (lng: string) => void) => {
      if (event === 'languageChanged') {
        languageChangeHandler = handler
      }
    })
    
    render(
      <I18nProvider>
        <div>Test</div>
      </I18nProvider>
    )
    
    if (languageChangeHandler) {
      languageChangeHandler('ja')
      expect(document.documentElement.lang).toBe('ja')
    }
  })

  it('should cleanup language change handler on unmount', () => {
    const { unmount } = render(
      <I18nProvider>
        <div>Test</div>
      </I18nProvider>
    )
    
    unmount()
    
    expect(mockI18nInstance.off).toHaveBeenCalledWith('languageChanged', expect.any(Function))
  })

  it('should return early when document is undefined (SSR)', () => {
    const originalDocument = global.document
    // @ts-expect-error - intentionally setting to undefined for SSR test
    global.document = undefined

    // Should not throw
    expect(() => {
      render(
        <I18nProvider>
          <div>Test</div>
        </I18nProvider>
      )
    }).not.toThrow()

    global.document = originalDocument
  })
})

