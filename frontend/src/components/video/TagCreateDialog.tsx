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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';

interface TagCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string) => Promise<void>;
}

const DEFAULT_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#6366F1',
  '#14B8A6',
];

export function TagCreateDialog({ isOpen, onClose, onCreate }: TagCreateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  const handleClose = () => {
    if (!isCreating) {
      setName('');
      setColor(DEFAULT_COLORS[0]);
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
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreate(name.trim(), color);
      setName('');
      setColor(DEFAULT_COLORS[0]);
      onClose();
    } catch (error) {
      console.error('Failed to create tag:', error);
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
            {t('tags.create.title')}
          </DialogHeading>
        </DialogHeader>

        <DialogBody>
          <p className="mb-4 text-std-16N-170 text-solid-gray-700">
            {t('tags.create.description')}
          </p>

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tag-name">{t('tags.create.nameLabel')}</Label>
              <Input
                id="tag-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('tags.create.namePlaceholder')}
                disabled={isCreating}
                maxLength={50}
                blockSize="md"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('tags.create.colorLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    disabled={isCreating}
                    className={`h-8 w-8 rounded-full transition-transform disabled:cursor-not-allowed disabled:opacity-50 ${
                      color === c ? 'ring-2 ring-key-900 ring-offset-2' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                    aria-pressed={color === c}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('tags.create.preview')}</Label>
              <div className="rounded-8 border border-solid-gray-300 bg-solid-gray-50 p-3">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {name || t('tags.create.previewPlaceholder')}
                </span>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="button" onClick={handleCreate} disabled={!name.trim() || isCreating}>
              {isCreating ? (
                <span className="flex items-center justify-center">
                  <InlineSpinner className="mr-2" />
                  {t('common.actions.creating', 'Creating...')}
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
