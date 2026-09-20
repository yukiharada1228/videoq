import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudySessionInfo } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function StudySessionNotice({ info, restarted, storageAvailable, isLoading, onRestart }: {
  info?: StudySessionInfo;
  restarted: boolean;
  storageAvailable: boolean;
  isLoading: boolean;
  onRestart: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!info) return;
    const update = () => setNow(Date.now());
    const timer = setTimeout(update, Math.max(0, info.expires_at - Date.now()));
    window.addEventListener('focus', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); };
  }, [info]);
  const expired = info && info.expires_at <= now;
  const status = expired ? 'expired' : info?.status ?? (restarted ? 'restarted' : 'unconfirmed');
  const locale = i18n.resolvedLanguage || i18n.language;

  return <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-solid-gray-200 px-4 py-3 text-dns-14N-130 leading-relaxed text-solid-gray-700">
    <p role="status">{t(`chat.studySession.${status}`)}</p>
    {info && !expired && <p className="mt-1">{t('chat.studySession.expires', {
      time: new Date(info.expires_at).toLocaleString(locale),
    })}</p>}
    {!storageAvailable && <p className="mt-1">{t('chat.studySession.storageUnavailable')}</p>}
    <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
      <details className="min-w-0 flex-1 basis-40">
        <summary className="cursor-pointer underline underline-offset-4">{t('chat.studySession.help')}</summary>
        <p className="mt-2">{t('chat.studySession.explanation')}</p>
      </details>
      <Button type="button" size="sm" variant="outline" disabled={isLoading} onClick={onRestart}>
        {t('chat.studySession.restart')}
      </Button>
    </div>
  </div>;
}
