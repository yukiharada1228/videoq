import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppNav, type ActivePage } from '@/components/layout/AppNav';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';
import { Button } from '@/components/ui/button';

const LEGAL_NOTICE_DISMISSED_KEY = 'videoq.legal-notice.2026-10-23.dismissed';
const LEGAL_NOTICE_EXPIRES_AT = Date.UTC(2026, 10, 17);

function wasLegalNoticeDismissed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(LEGAL_NOTICE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface AppPageShellProps {
  activePage?: ActivePage;
  children: ReactNode;
  contentClassName?: string;
  variant?: 'standard' | 'workspace';
}

export function AppPageShell({
  activePage,
  children,
  contentClassName = APP_CONTAINER_CLASS,
  variant = 'standard',
}: AppPageShellProps) {
  const { t } = useTranslation();
  const [noticeDismissed, setNoticeDismissed] = useState(wasLegalNoticeDismissed);
  const [noticeActive, setNoticeActive] = useState(() => Date.now() < LEGAL_NOTICE_EXPIRES_AT);
  const mainClassName = variant === 'workspace'
    ? 'flex w-full flex-1 flex-col'
    : `mx-auto w-full flex-1 pb-16 pt-8 ${contentClassName}`;

  useEffect(() => {
    if (!noticeActive) return;
    let timeout: number;
    const checkExpiry = () => {
      const remaining = LEGAL_NOTICE_EXPIRES_AT - Date.now();
      if (remaining <= 0) {
        setNoticeActive(false);
      } else {
        timeout = window.setTimeout(checkExpiry, Math.min(remaining, 24 * 60 * 60 * 1000));
      }
    };
    checkExpiry();
    return () => window.clearTimeout(timeout);
  }, [noticeActive]);

  const dismissLegalNotice = () => {
    setNoticeDismissed(true);
    try {
      window.localStorage.setItem(LEGAL_NOTICE_DISMISSED_KEY, '1');
    } catch {
      // The notice still closes for this page when storage is unavailable.
    }
  };

  return (
    <div
      className={`flex min-h-screen flex-col text-solid-gray-800 ${variant === 'standard' ? 'bg-background' : 'bg-solid-gray-50'}`}
      style={{ scrollbarGutter: 'stable' }}
    >
      <AppNav activePage={activePage} />
      {variant === 'standard' && !noticeDismissed && noticeActive && (
        <aside className="border-b border-solid-gray-420 bg-solid-gray-50" aria-label={t('legal.notice.title')}>
          <div className={`mx-auto flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 ${APP_CONTAINER_CLASS}`}>
            <p className="min-w-0 flex-1 text-std-14N-170 text-solid-gray-800">
              <strong>{t('legal.notice.title')}</strong>{' '}{t('legal.notice.body')}
            </p>
            <div className="flex gap-4 text-std-14N-170">
              <Link href="/terms" className="text-blue-900 underline">{t('legal.terms.title')}</Link>
              <Link href="/privacy" className="text-blue-900 underline">{t('legal.privacy.title')}</Link>
            </div>
            <Button type="button" variant="text" size="xs" onClick={dismissLegalNotice}>
              {t('common.actions.close')}
            </Button>
          </div>
        </aside>
      )}
      <main className={mainClassName}>
        {children}
      </main>
      {variant === 'standard' && <AppFooter />}
    </div>
  );
}
