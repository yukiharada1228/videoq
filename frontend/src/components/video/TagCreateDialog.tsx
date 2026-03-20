'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

interface TagCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string) => Promise<void>;
}

const DEFAULT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // yellow
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#6366F1', // indigo
  '#14B8A6', // teal
];

export function TagCreateDialog({ isOpen, onClose, onCreate }: TagCreateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

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

  const handleClose = () => {
    if (!isCreating) {
      setName('');
      setColor(DEFAULT_COLORS[0]);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tags.create.title', 'Create New Tag')}</DialogTitle>
          <DialogDescription>
            {t('tags.create.description', 'Create a new tag to organize your videos.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#3f493f] uppercase tracking-widest">
              {t('tags.create.nameLabel', 'Tag Name')}
            </label>
            <input
              id="tag-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('tags.create.namePlaceholder', 'Enter tag name')}
              disabled={isCreating}
              maxLength={50}
              className="w-full px-4 py-3 bg-[#f2f4ef] border border-transparent rounded-xl text-sm text-[#191c19] placeholder:text-stone-400 focus:outline-none focus:border-[#00652c] focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#3f493f] uppercase tracking-widest">
              {t('tags.create.colorLabel', 'Tag Color')}
            </label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  disabled={isCreating}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-[#00652c]' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#3f493f] uppercase tracking-widest">
              {t('tags.create.preview', 'Preview')}
            </label>
            <div className="p-3 border border-stone-200 rounded-xl bg-[#f8faf5]">
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: `${color}20`, color: color }}
              >
                {name || t('tags.create.previewPlaceholder', 'Tag preview')}
              </span>
            </div>
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
                {t('common.actions.creating', 'Creating...')}
              </span>
            ) : t('common.actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
