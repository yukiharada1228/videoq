'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageAlert } from '@/components/common/MessageAlert';
import { Button } from '@/components/ui/button';
import { VideoUploadButton } from './VideoUploadButton';
import { useTranslation } from 'react-i18next';

interface VideoUploadFormFieldsProps {
  title: string;
  description: string;
  isUploading: boolean;
  error: string | null;
  success: boolean;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  file?: File | null;
  showCancelButton?: boolean;
  onCancel?: () => void;
  cancelButtonClassName?: string;
  hideButtons?: boolean;
  renderButtons?: () => React.ReactNode;
}

export function VideoUploadFormFields({
  title,
  description,
  isUploading,
  error,
  success,
  setTitle,
  setDescription,
  handleFileChange,
  file,
  showCancelButton = false,
  onCancel,
  cancelButtonClassName,
  hideButtons = false,
  renderButtons,
}: VideoUploadFormFieldsProps) {
  const { t } = useTranslation();

  // プレースホルダーを動的に生成
  const getTitlePlaceholder = () => {
    if (file) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      return t('videos.upload.titlePlaceholder', { fileName: fileNameWithoutExt });
    }
    return t('videos.upload.titleEmptyPlaceholder');
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="file">{t('videos.upload.fileLabel')}</Label>
        <Input
          id="file"
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          disabled={isUploading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">{t('videos.upload.titleLabel')}</Label>
        <Input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={getTitlePlaceholder()}
          disabled={isUploading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('videos.upload.descriptionLabel')}</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('videos.upload.descriptionPlaceholder')}
          disabled={isUploading}
          className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <MessageAlert type="error" message={error} />}
      {success && <MessageAlert type="success" message={t('videos.upload.success')} />}

      {!hideButtons && (
        renderButtons ? (
          renderButtons()
        ) : showCancelButton ? (
          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel} 
              disabled={isUploading} 
              className={cancelButtonClassName}
            >
              {t('common.actions.cancel')}
            </Button>
            <VideoUploadButton isUploading={isUploading} fullWidth className="flex-1" />
          </div>
        ) : (
          <VideoUploadButton isUploading={isUploading} fullWidth />
        )
      )}
    </>
  );
}

