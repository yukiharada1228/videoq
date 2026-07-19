'use client';

import { useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface VideoNavBarProps {
  onUploadClick: () => void;
}

export function VideoNavBar({ onUploadClick }: VideoNavBarProps) {
  const navigate = useI18nNavigate();
  const { t } = useTranslation();

  return (
    <div className="border-b border-solid-gray-200 bg-white">
      <div className="px-4 py-3">
        <nav className="flex items-center gap-3">
          <Button
            type="button"
            variant="text"
            size="sm"
            onClick={() => navigate('/')}
            className="min-w-0 px-2"
          >
            ← {t('common.actions.backToHome')}
          </Button>
          <span className="text-solid-gray-300" aria-hidden="true">
            |
          </span>
          <Button
            type="button"
            variant="text"
            size="sm"
            onClick={onUploadClick}
            className="min-w-0 px-2"
          >
            ＋ {t('videos.list.uploadButton')}
          </Button>
        </nav>
      </div>
    </div>
  );
}
