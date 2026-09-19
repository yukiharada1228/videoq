import { useTranslation } from 'react-i18next';
import { UtilityLink } from '@/components/ui/utility-link';

/** Explain the same sharing contract before publishing, joining, or chatting. */
export function CourseSharingNotice({ method }: { method: 'link' | 'invitation' }) {
  const { t, i18n } = useTranslation();
  // The documentation site defaults to English; the app defaults to Japanese.
  const localePath = (i18n.resolvedLanguage || i18n.language).startsWith('ja') ? '/ja' : '';

  return (
    <div className="shrink-0 space-y-2 text-dns-14N-130 leading-relaxed text-solid-gray-700">
      <p>{t(`courseSharing.${method}`)}</p>
      <p>{t('courseSharing.quotaAndHistory')}</p>
      <UtilityLink
        href={`https://docs.videoq.jp${localePath}/concepts/course-sharing/`}
        target="_blank"
        rel="noopener noreferrer"
        icon={{ 'aria-label': t('courseSharing.opensInNewTab') }}
      >
        {t('courseSharing.learnMore')}
      </UtilityLink>
    </div>
  );
}
