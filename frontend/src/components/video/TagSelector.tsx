'use client';

import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { Tag } from '@/lib/api';

interface TagSelectorProps {
  tags: Tag[];
  selectedTagIds: number[];
  onToggle: (tagId: number) => void;
  onCreateNew?: () => void;
  disabled?: boolean;
}

export function TagSelector({
  tags,
  selectedTagIds,
  onToggle,
  onCreateNew,
  disabled = false,
}: TagSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{t('tags.selector.label', 'Tags')}</Label>
        {onCreateNew && (
          <Button type="button" variant="ghost" size="sm" onClick={onCreateNew} disabled={disabled}>
            + {t('tags.selector.createNew', 'Create new tag')}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
        {tags.length === 0 ? (
          <p className="text-sm text-gray-500">{t('tags.selector.noTags', 'No tags available')}</p>
        ) : (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => !disabled && onToggle(tag.id)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                selectedTagIds.includes(tag.id)
                  ? 'ring-2 ring-offset-2'
                  : 'opacity-60 hover:opacity-100'
              } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
                ...(selectedTagIds.includes(tag.id) && { ringColor: tag.color }),
              }}
            >
              {tag.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
