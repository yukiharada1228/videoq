'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequirementBadge } from '@/components/ui/requirement-badge';
import { MessageAlert } from '@/components/common/MessageAlert';
import { Button } from '@/components/ui/button';
import { VideoUploadButton } from './VideoUploadButton';
import { useTranslation } from 'react-i18next';

interface VideoUploadFormFieldsProps {
  title: string;
  description: string;
  isUploading: boolean;
  disabled?: boolean;
  error: string | null;
  errorParams?: Record<string, unknown>;
  warning?: string | null;
  warningParams?: Record<string, unknown>;
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
  disabled = false,
  error,
  errorParams = {},
  warning = null,
  warningParams = {},
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

  // Dynamically generate placeholder
  const getTitlePlaceholder = () => {
    if (file) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      return t('videos.upload.titlePlaceholder', { fileName: fileNameWithoutExt });
    }
    return t('videos.upload.titleEmptyPlaceholder');
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">
          {t('videos.upload.fileLabel')}
          <RequirementBadge>{t('common.labels.required')}</RequirementBadge>
        </Label>
        <Input
          id="file"
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          disabled={isUploading || disabled}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">
          {t('videos.upload.titleLabel')}
          <RequirementBadge>{t('common.labels.required')}</RequirementBadge>
        </Label>
        <Input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={getTitlePlaceholder()}
          disabled={isUploading || disabled}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">
          {t('videos.upload.descriptionLabel')}
          <RequirementBadge isOptional>{t('common.labels.optional')}</RequirementBadge>
        </Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('videos.upload.descriptionPlaceholder')}
          disabled={isUploading || disabled}
          className="min-h-[100px] resize-none"
        />
      </div>

      {error && <MessageAlert type="error" message={t(error, { defaultValue: error, ...errorParams })} />}
      {warning && <MessageAlert type="warning" message={t(warning, { defaultValue: warning, ...warningParams })} />}
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
              disabled={isUploading || disabled} 
              className={cancelButtonClassName}
            >
              {t('common.actions.cancel')}
            </Button>
            <VideoUploadButton isUploading={isUploading} disabled={disabled} fullWidth className="flex-1" />
          </div>
        ) : (
          <VideoUploadButton isUploading={isUploading} disabled={disabled} fullWidth />
        )
      )}
    </>
  );
}
