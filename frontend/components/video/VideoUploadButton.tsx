'use client';

import { Button } from '@/components/ui/button';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { useTranslations } from 'next-intl';

interface VideoUploadButtonProps {
  isUploading: boolean;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline';
  fullWidth?: boolean;
}

export function VideoUploadButton({ 
  isUploading, 
  disabled = false,
  className,
  variant = 'default',
  fullWidth = false
}: VideoUploadButtonProps) {
  const t = useTranslations();

  return (
    <Button 
      type="submit" 
      disabled={isUploading || disabled} 
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

