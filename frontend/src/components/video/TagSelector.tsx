'use client';

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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-[#3f493f] uppercase tracking-widest">
          {t('tags.selector.label', 'Tags')}
        </label>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            disabled={disabled}
            className="text-[11px] font-bold text-[#00652c] hover:underline disabled:opacity-50"
          >
            + {t('tags.selector.createNew', 'Create new tag')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-stone-200 rounded-xl bg-[#f8faf5]">
        {tags.length === 0 ? (
          <p className="text-sm text-[#6f7a6e]">{t('tags.selector.noTags', 'No tags available')}</p>
        ) : (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => !disabled && onToggle(tag.id)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                selectedTagIds.includes(tag.id)
                  ? ''
                  : 'opacity-60 hover:opacity-100'
              } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
                ...(selectedTagIds.includes(tag.id) && {
                  outline: `2px solid ${tag.color}`,
                  outlineOffset: '2px',
                }),
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
