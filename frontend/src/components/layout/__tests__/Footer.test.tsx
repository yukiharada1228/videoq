import { render, screen } from '@testing-library/react'

import { Footer } from '../Footer'

const messages = {
  layout: { footer: { copyright: '© {{year}} VideoQ. All rights reserved.' } },
}

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, options?: { year?: number }) => {
    if (key === 'layout.footer.copyright') {
      return messages.layout.footer.copyright.replace(
        '{{year}}',
        String(options?.year ?? ''),
      )
    }
    return key
  },
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useLocale: () => 'en',
}))

describe('Footer', () => {
  it('should render footer with copyright text', () => {
    render(<Footer />)

    const currentYear = new Date().getFullYear()
    expect(
      screen.getByText(`© ${currentYear} VideoQ. All rights reserved.`),
    ).toBeInTheDocument()
  })

  it('should have correct footer structure', () => {
    const { container } = render(<Footer />)

    const footer = container.querySelector('footer')
    expect(footer).toBeInTheDocument()
    expect(footer?.className).toContain('border-t')
    expect(footer?.className).toContain('bg-white')
  })
})

