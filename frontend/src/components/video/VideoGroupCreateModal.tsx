'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  useDialog,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

interface VideoGroupCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}

export function VideoGroupCreateModal({ isOpen, onClose, onCreate }: VideoGroupCreateModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleClose = () => {
    if (!isCreating) {
      setName('');
      setDescription('');
      setFormError(null);
      onClose();
    }
  };

  const dialog = useDialog({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) handleClose();
    },
    onRequestClose: (event) => {
      if (isCreating) event.preventDefault();
    },
  });

  const handleCreate = async () => {
    if (!name.trim()) {
      setFormError(t('validation.required'));
      return;
    }
    setFormError(null);
    setIsCreating(true);
    try {
      await onCreate(name.trim(), description.trim());
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('videos.groups.createError');
      setFormError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog {...dialog.dialogProps} width="min(32rem, 92vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>
            {t('videos.groups.createTitle')}
          </DialogHeading>
        </DialogHeader>

        <DialogBody>
          <p className="mb-4 text-std-16N-170 text-solid-gray-700">
            {t('videos.groups.subtitle')}
          </p>

          <div className="space-y-4">
            {formError && (
              <div className="rounded-8 border border-error-1 bg-red-50 p-3 text-sm text-error-1">
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-solid-gray-700">
                {t('videos.groups.nameLabel')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('videos.groups.namePlaceholder')}
                disabled={isCreating}
                autoFocus
                className="w-full rounded-8 border border-solid-gray-300 bg-white px-4 py-3 text-sm text-solid-gray-800 placeholder:text-solid-gray-420 focus:outline focus:outline-4 focus:outline-black focus:outline-offset-[calc(2/16*1rem)] focus:ring-[calc(2/16*1rem)] focus:ring-yellow-300"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-solid-gray-700">
                {t('videos.groups.descriptionLabel')}
                <span className="ml-1 normal-case font-normal text-solid-gray-420">
                  {t('videos.groups.optional')}
                </span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('videos.groups.descriptionPlaceholder')}
                disabled={isCreating}
                className="w-full rounded-8 border border-solid-gray-300 bg-white px-4 py-3 text-sm text-solid-gray-800 placeholder:text-solid-gray-420 focus:outline focus:outline-4 focus:outline-black focus:outline-offset-[calc(2/16*1rem)] focus:ring-[calc(2/16*1rem)] focus:ring-yellow-300"
              />
            </div>
          </div>
        </DialogBody>

        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
              {isCreating ? (
                <span className="flex items-center justify-center">
                  <InlineSpinner className="mr-2" />
                  {t('common.actions.creating')}
                </span>
              ) : (
                t('common.actions.create')
              )}
            </Button>
          </div>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
