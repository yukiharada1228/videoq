'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoGroup } from '@/lib/api';
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
import { InlineSpinner } from '@/components/common/InlineSpinner';

interface AddToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: VideoGroup[];
  videoCount: number;
  onAdd: (groupId: number) => Promise<void>;
}

export function AddToGroupModal({ isOpen, onClose, groups, videoCount, onAdd }: AddToGroupModalProps) {
  const { t } = useTranslation();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleClose = () => {
    if (!isAdding) {
      setSelectedGroupId(null);
      onClose();
    }
  };

  const dialog = useDialog({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) handleClose();
    },
    onRequestClose: (event) => {
      if (isAdding) event.preventDefault();
    },
  });

  const handleAdd = async () => {
    if (!selectedGroupId) return;

    setIsAdding(true);
    try {
      await onAdd(selectedGroupId);
      setSelectedGroupId(null);
      onClose();
    } catch (error) {
      console.error('Failed to add videos to group:', error);
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog {...dialog.dialogProps} width="min(32rem, 92vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>
            {t('videos.addToGroup.title', 'Add Videos to Group')}
          </DialogHeading>
        </DialogHeader>

        <DialogBody>
          <p className="mb-4 text-std-16N-170 text-solid-gray-700">
            {t('videos.addToGroup.description', { count: videoCount })}
          </p>

          <div className="space-y-4">
            {groups.length === 0 ? (
              <p className="py-4 text-center text-sm text-solid-gray-600">
                {t('videos.addToGroup.noGroups', 'No chat groups available. Create a group first.')}
              </p>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-solid-gray-700">
                  {t('videos.addToGroup.selectGroup', 'Select a group')}
                </label>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      disabled={isAdding}
                      className={`w-full rounded-8 border p-3 text-left transition-all ${
                        selectedGroupId === group.id
                          ? 'border-key-900 bg-key-50 ring-2 ring-key-900/20'
                          : 'border-solid-gray-300 hover:border-solid-gray-420 hover:bg-solid-gray-50'
                      }`}
                    >
                      <div className="text-sm font-medium text-solid-gray-800">{group.name}</div>
                      {group.description && (
                        <div className="mt-1 line-clamp-2 text-xs text-solid-gray-600">{group.description}</div>
                      )}
                      <div className="mt-1 text-xs text-solid-gray-600">
                        {t('videos.addToGroup.videoCount', { count: group.video_count || 0 })}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isAdding}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleAdd} disabled={!selectedGroupId || isAdding || groups.length === 0}>
              {isAdding ? (
                <span className="flex items-center">
                  <InlineSpinner className="mr-2" />
                  {t('videos.addToGroup.adding', 'Adding...')}
                </span>
              ) : (
                t('videos.addToGroup.add', 'Add to Group')
              )}
            </Button>
          </div>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
