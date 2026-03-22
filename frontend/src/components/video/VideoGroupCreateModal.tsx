'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

  const handleClose = () => {
    if (!isCreating) {
      setName('');
      setDescription('');
      setFormError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('videos.groups.createTitle')}</DialogTitle>
          <DialogDescription>{t('videos.groups.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#3f493f] uppercase tracking-wider">
              {t('videos.groups.nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('videos.groups.namePlaceholder')}
              disabled={isCreating}
              autoFocus
              className="w-full px-4 py-3 bg-[#f2f4ef] border border-transparent rounded-xl text-sm text-[#191c19] placeholder:text-stone-400 focus:outline-none focus:border-[#00652c] focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#3f493f] uppercase tracking-wider">
              {t('videos.groups.descriptionLabel')}
              <span className="ml-1 normal-case font-normal text-stone-400">
                {t('videos.groups.optional')}
              </span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('videos.groups.descriptionPlaceholder')}
              disabled={isCreating}
              className="w-full px-4 py-3 bg-[#f2f4ef] border border-transparent rounded-xl text-sm text-[#191c19] placeholder:text-stone-400 focus:outline-none focus:border-[#00652c] focus:bg-white transition-all"
            />
          </div>
        </div>

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
