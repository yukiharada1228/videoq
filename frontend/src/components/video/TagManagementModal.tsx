'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  useDialog,
} from '@/components/ui/dialog';
import { useTags } from '@/hooks/useTags';
import { TagBadge } from '@/components/video/TagBadge';

interface TagManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TagManagementModal({ isOpen, onClose }: TagManagementModalProps) {
  const { t } = useTranslation();
  const { tags, deleteTag } = useTags();
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const dialog = useDialog({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  const handleDelete = async (id: number) => {
    try {
      await deleteTag(id);
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete tag:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog {...dialog.dialogProps} width="min(28rem, 92vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>
            {t('tags.management.title', 'Tag Management')}
          </DialogHeading>
        </DialogHeader>

        <DialogBody>
          <p className="mb-4 text-std-16N-170 text-solid-gray-700">
            {t('tags.management.description', 'Review existing tags and remove tags you no longer need.')}
          </p>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
            {tags.length === 0 ? (
              <div className="py-8 text-center text-sm text-solid-gray-600">
                {t('tags.selector.noTags', 'No tags available')}
              </div>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <TagBadge tag={tag} size="sm" />
                    </div>

                    {deleteConfirmId === tag.id ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="solid"
                          size="sm"
                          className="bg-error-1 hover:bg-red-1000 active:bg-red-1200"
                          onClick={() => handleDelete(tag.id)}
                          data-testid={`confirm-delete-${tag.id}`}
                        >
                          {t('common.actions.delete', 'Delete')}
                        </Button>
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                          data-testid={`cancel-delete-${tag.id}`}
                        >
                          {t('common.actions.cancel', 'Cancel')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="text"
                        size="sm"
                        className="min-w-9 px-2 text-solid-gray-600 hover:text-error-1"
                        onClick={() => setDeleteConfirmId(tag.id)}
                        data-testid={`delete-tag-${tag.id}`}
                        aria-label={t('common.actions.delete', 'Delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              {t('common.actions.close', 'Close')}
            </Button>
          </div>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
