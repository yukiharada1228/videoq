'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoGroup } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  const handleClose = () => {
    if (!isAdding) {
      setSelectedGroupId(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('videos.addToGroup.title', 'Add Videos to Group')}</DialogTitle>
          <DialogDescription>
            {t('videos.addToGroup.description', { count: videoCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {groups.length === 0 ? (
            <p className="text-sm text-[#6f7a6e] text-center py-4">
              {t('videos.addToGroup.noGroups', 'No chat groups available. Create a group first.')}
            </p>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#3f493f] uppercase tracking-wider">
                {t('videos.addToGroup.selectGroup', 'Select a group')}
              </label>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    disabled={isAdding}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedGroupId === group.id
                        ? 'border-[#00652c] bg-[#f0fdf4] ring-2 ring-[#00652c]/20'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-[#f8faf5]'
                    }`}
                  >
                    <div className="font-medium text-sm text-[#191c19]">{group.name}</div>
                    {group.description && (
                      <div className="text-xs text-[#6f7a6e] mt-1 line-clamp-2">{group.description}</div>
                    )}
                    <div className="text-xs text-[#6f7a6e] mt-1">
                      {t('videos.addToGroup.videoCount', { count: group.video_count || 0 })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
