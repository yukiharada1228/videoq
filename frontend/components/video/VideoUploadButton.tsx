'use client';

import { Button } from '@/components/ui/button';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { useTranslation } from 'react-i18next';

interface VideoUploadButtonProps {
  isUploading: boolean;
  className?: string;
  variant?: 'default' | 'outline';
  fullWidth?: boolean;
}

export function VideoUploadButton({ 
  isUploading, 
  className,
  variant = 'default',
  fullWidth = false
}: VideoUploadButtonProps) {
  const { t } = useTranslation();

  return (
    <Button 
      type="submit" 
      disabled={isUploading} 
      className={fullWidth ? `w-full ${className || ''}` : className}
      variant={variant}
    >
      {isUploading ? (
        <span className={fullWidth ? "flex items-center" : "flex items-center justify-center"}>
          <InlineSpinner className="mr-2" />
          {t('videos.upload.uploading')}
        </span>
      ) : (
        t('videos.upload.upload')
      )}
    </Button>
  );
}

