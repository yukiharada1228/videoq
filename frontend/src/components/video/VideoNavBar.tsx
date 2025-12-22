'use client';

import { useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

interface VideoNavBarProps {
  onUploadClick: () => void;
}

export function VideoNavBar({ onUploadClick }: VideoNavBarProps) {
  const navigate = useI18nNavigate();
  const { t } = useTranslation();

  return (
    <div className="bg-white border-b">
      <div className="px-4 py-3">
        <nav className="flex items-center gap-6">
          <button
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← {t('common.actions.backToHome')}
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={onUploadClick}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ＋ {t('videos.list.uploadButton')}
          </button>
        </nav>
      </div>
    </div>
  );
}

