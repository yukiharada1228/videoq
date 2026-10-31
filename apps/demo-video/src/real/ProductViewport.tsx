import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import i18n from '@/i18n/config';
import { FeedbackProvider } from '@/components/common/FeedbackProvider';
import { trpc } from '@/lib/trpc';
import { LocaleContext, demoUser } from './data';
import type { Locale } from './film';

export const VIEWPORT = { width: 1600, height: 802 };
const FONTS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+Mono:wght@400;700&display=swap';
const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
queryClient.setQueryData(trpc.account.me.queryKey(), demoUser as never);

const settled = new WeakSet<HTMLVideoElement>();

// The native scrubber paints the buffered range, so it must be full on every frame.
// Chrome fully preloads files under 2 MiB, which is why the lessons are kept below that.
function buffered(video: HTMLVideoElement) {
  if (video.controls) video.preload = 'auto';
  return new Promise<void>(resolve => {
    const check = () => {
      const full = !video.controls || (video.buffered.length > 0 && video.buffered.end(video.buffered.length - 1) >= video.duration - 0.1);
      // Chrome's spinner lingers until its animation cycle ends after buffering.
      if (video.error) resolve();
      else if (video.readyState >= 3 && !video.seeking && full) {
        if (settled.has(video)) resolve();
        else { settled.add(video); setTimeout(resolve, 1500); }
      }
      else setTimeout(check, 30);
    };
    check();
  });
}

/** Web fonts load per glyph range: resolves once the document's current text can render. */
export function fontsReady(doc: Document) {
  const text = doc.body.textContent ?? '';
  return Promise.all(['400', '500', '700'].map(weight => doc.fonts.load(`${weight} 16px "Noto Sans JP"`, text))).then(() => doc.fonts.ready);
}

const loaded = (link: HTMLLinkElement) => new Promise(resolve => { link.onload = resolve; link.onerror = resolve; });

/**
 * Hosts the real app in a same-origin iframe of a desktop browser's size, so
 * dvh, breakpoints, fixed headers and native modal dialogs lay out as they do
 * in production while the whole window can still be moved by the film's camera.
 */
export function ProductViewport({ locale, path, children }: { locale: Locale; path: string; children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [setup] = useState(() => delayRender('Loading the product viewport'));
  const current = useCurrentFrame();

  const onLoad = () => {
    const target = frame.current?.contentDocument;
    if (!target) return;
    target.documentElement.lang = locale;
    const links = [staticFile('generated/web.css'), FONTS].map(href => {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      target.head.append(link);
      return loaded(link);
    });
    const freeze = target.createElement('style');
    // Remotion seeks frames out of order, so wall-clock animation cannot run.
    freeze.textContent = '*,*::before,*::after,::backdrop{transition:none!important;animation:none!important;caret-color:transparent!important}';
    target.head.append(freeze);
    void i18n.changeLanguage(locale);
    void Promise.all(links).then(() => { setDoc(target); continueRender(setup); });
  };

  // Hold each screenshot until this frame's glyphs, images and videos are ready.
  useLayoutEffect(() => {
    if (!doc) return;
    // AppNav publishes its height on the host document's root element.
    const offset = document.documentElement.style.getPropertyValue('--app-header-offset');
    if (offset) doc.documentElement.style.setProperty('--app-header-offset', offset);
    const handle = delayRender('Loading fonts and media for this frame');
    // After this commit's own layout effects have flushed, such as selecting a lesson.
    setTimeout(() => {
      // The app serves the logo from its root; the film serves it from the public folder.
      doc.querySelectorAll<HTMLImageElement>('img[src="/logo192.png"]').forEach(logo => { logo.src = staticFile('generated/logo192.png'); });
      const images = Array.from(doc.images).filter(image => !image.complete).map(image => new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }));
      const videos = Array.from(doc.querySelectorAll('video')).map(buffered);
      void Promise.all([...images, ...videos, fontsReady(doc)]).finally(() => continueRender(handle));
    }, 0);
  }, [doc, current]);

  return <>
    <iframe ref={frame} title="VideoQ" srcDoc="<!doctype html><html><head></head><body></body></html>" onLoad={onLoad}
      style={{ ...VIEWPORT, border: 0, display: 'block' }}/>
    {doc && createPortal(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <LocaleContext.Provider value={locale}>
            <MemoryRouter initialEntries={[locale === 'en' ? `/en${path}` : path]}>
              <FeedbackProvider>{children}</FeedbackProvider>
            </MemoryRouter>
          </LocaleContext.Provider>
        </QueryClientProvider>
      </I18nextProvider>,
      doc.body,
    )}
  </>;
}
