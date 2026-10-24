import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useLocaleSync } from '@/lib/i18n';

vi.unmock('react-router-dom');
vi.unmock('react-i18next');
vi.unmock('@/lib/i18n');
vi.mock('@/lib/deployment', () => ({ isOnprem: true }));

function Metadata() { useLocaleSync(); return null; }

it.each([{ path: '/settings', lang: 'ja' }, { path: '/en/settings', lang: 'en' }])(
  'keeps $path private and removes SaaS metadata after locale synchronization', async ({ path, lang }) => {
    const head = document.head.innerHTML;
    const title = document.title;
    const originalLang = document.documentElement.lang;
    try {
      document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="index, follow"><link rel="canonical" href="https://videoq.jp"><link rel="alternate" hreflang="en" href="https://videoq.jp/en"><meta property="og:url" content="https://videoq.jp"><meta name="twitter:title" content="Public marketing"><script type="application/ld+json">{}</script>');
      render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/settings" element={<Metadata />} /><Route path="/:locale/settings" element={<Metadata />} /></Routes></MemoryRouter>);
      await waitFor(() => expect(document.title).toBe('VideoQ'));
      expect(document.documentElement.lang).toBe(lang);
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      expect(document.querySelector('link[rel="canonical"],link[hreflang],meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"]')).toBeNull();
    } finally {
      document.head.innerHTML = head;
      document.title = title;
      document.documentElement.lang = originalLang;
    }
  },
);
