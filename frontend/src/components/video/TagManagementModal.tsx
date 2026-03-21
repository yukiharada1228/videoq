'use client';

import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTags } from '@/hooks/useTags';
import { Trash2 } from 'lucide-react';
import { TagBadge } from '@/components/video/TagBadge';
import { useState } from 'react';

interface TagManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TagManagementModal({ isOpen, onClose }: TagManagementModalProps) {
    const { t } = useTranslation();
    const { tags, deleteTag } = useTags();
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    const handleDelete = async (id: number) => {
        try {
            await deleteTag(id);
            setDeleteConfirmId(null);
        } catch (error) {
            console.error('Failed to delete tag:', error);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('tags.management.title', 'Tag Management')}</DialogTitle>
                    <DialogDescription>
                        {t('tags.management.description', 'Review existing tags and remove tags you no longer need.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto py-4">
                    {tags.length === 0 ? (
                        <div className="text-center py-8 text-[#6f7a6e] text-sm">
                            {t('tags.selector.noTags', 'No tags available')}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tags.map((tag) => (
                                <div
                                    key={tag.id}
                                    className="flex items-center justify-between p-3 rounded-xl bg-[#f8faf5] border border-stone-100"
                                >
                                    <div className="flex items-center gap-2">
                                        <TagBadge tag={tag} size="sm" />
                                    </div>

                                    {deleteConfirmId === tag.id ? (
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                className="h-7 px-2"
                                                onClick={() => handleDelete(tag.id)}
                                                data-testid={`confirm-delete-${tag.id}`}
                                            >
                                                {t('common.actions.delete', 'Delete')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2"
                                                onClick={() => setDeleteConfirmId(null)}
                                                data-testid={`cancel-delete-${tag.id}`}
                                            >
                                                {t('common.actions.cancel', 'Cancel')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-[#6f7a6e] hover:text-red-500"
                                            onClick={() => setDeleteConfirmId(tag.id)}
                                            data-testid={`delete-tag-${tag.id}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.actions.close', 'Close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
