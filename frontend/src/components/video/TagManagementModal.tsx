'use client';

import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTags } from '@/hooks/useTags';
import { Trash2, Tag as TagIcon } from 'lucide-react';
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
                </DialogHeader>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto py-4">
                    {tags.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            {t('tags.selector.noTags', 'No tags available')}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tags.map((tag) => (
                                <div
                                    key={tag.id}
                                    className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        <TagIcon
                                            className="h-4 w-4"
                                            style={{ color: tag.color }}
                                        />
                                        <span className="font-medium text-sm">{tag.name}</span>
                                    </div>

                                    {deleteConfirmId === tag.id ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-red-500 font-medium">
                                                {t('common.actions.confirm', 'Confirm?')}
                                            </span>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                className="h-7 px-2"
                                                onClick={() => handleDelete(tag.id)}
                                            >
                                                {t('common.actions.delete', 'Delete')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2"
                                                onClick={() => setDeleteConfirmId(null)}
                                            >
                                                {t('common.actions.cancel', 'Cancel')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-gray-400 hover:text-red-500"
                                            onClick={() => setDeleteConfirmId(tag.id)}
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
