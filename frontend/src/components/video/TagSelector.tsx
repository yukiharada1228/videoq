'use client';

import { useTranslation } from 'react-i18next';
import type { Tag } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label size="sm" className="text-solid-gray-700">
          {t('tags.selector.label')}
        </Label>
        {onCreateNew && (
          <Button
            type="button"
            variant="text"
            size="xs"
            onClick={onCreateNew}
            disabled={disabled}
            className="min-w-0 px-1"
          >
            + {t('tags.selector.createNew')}
          </Button>
        )}
      </div>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-8 border border-solid-gray-300 bg-solid-gray-50 p-2">
        {tags.length === 0 ? (
          <p className="text-sm text-solid-gray-600">{t('tags.selector.noTags')}</p>
        ) : (
          tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => !disabled && onToggle(tag.id)}
                disabled={disabled}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-opacity ${
                  isSelected ? '' : 'opacity-60 hover:opacity-100'
                } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                  ...(isSelected && {
                    outline: `2px solid ${tag.color}`,
                    outlineOffset: '2px',
                  }),
                }}
              >
                {tag.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
