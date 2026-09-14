import type { Preview } from '@storybook/react-vite';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { mswLoader } from 'msw-storybook-addon/csf3';
import i18n from '../src/i18n/config';
import '../src/index.css';

const preview: Preview = {
  tags: ['autodocs'],
  loaders: [mswLoader()],
  globalTypes: {
    locale: {
      description: '表示言語 / Language',
      toolbar: {
        icon: 'globe',
        items: [{ value: 'ja', title: '日本語' }, { value: 'en', title: 'English' }],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'ja' },
  parameters: {
    layout: 'padded',
    viewport: {
      options: {
        mobile: { name: 'Mobile (390px)', styles: { width: '390px', height: '844px' }, type: 'mobile' },
        desktop: { name: 'Desktop (1280px)', styles: { width: '1280px', height: '900px' }, type: 'desktop' },
      },
    },
    // Report existing accessibility issues while establishing the catalog.
    a11y: { test: 'todo' },
  },
  async beforeEach({ globals }) {
    const locale = globals.locale === 'en' ? 'en' : 'ja';
    await i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  },
  decorators: [
    (Story, context) => {
      const locale = context.globals.locale === 'en' ? 'en' : 'ja';
      const pathname = context.parameters.pathname ?? '/';
      const entry = locale === 'en' ? `/en${pathname}` : pathname;
      return (
        <I18nextProvider i18n={i18n}>
          <MemoryRouter key={`${context.id}:${locale}:${pathname}`} initialEntries={[entry]}>
            <Routes>
              <Route path={locale === 'en' ? '/:locale/*' : '/*'} element={<Story />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      );
    },
  ],
};

export default preview;
