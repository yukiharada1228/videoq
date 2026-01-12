'use client';

import { useTranslation } from 'react-i18next';
import type { Tag } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Settings2 } from 'lucide-react';

interface TagFilterPanelProps {
  tags: Tag[];
  selectedTagIds: number[];
  onToggle: (tagId: number) => void;
  onClear: () => void;
  onManageTags?: () => void;
  disabled?: boolean;
}

export function TagFilterPanel({ tags, selectedTagIds, onToggle, onClear, onManageTags, disabled = false }: TagFilterPanelProps) {
  const { t } = useTranslation();

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-700">{t('tags.filter.title', 'Filter by Tags')}</h3>
          {onManageTags && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onManageTags}
              disabled={disabled}
              className="h-6 w-6 text-gray-400 hover:text-gray-700"
              title={t('tags.management.title', 'Tag Management')}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {selectedTagIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            className="text-xs h-7"
          >
            {t('tags.filter.clear', 'Clear')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => onToggle(tag.id)}
              disabled={disabled}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isSelected
                ? 'ring-2 ring-offset-2 opacity-100'
                : 'opacity-60 hover:opacity-80'
                }`}
              style={{
                backgroundColor: isSelected ? `${tag.color}30` : `${tag.color}20`,
                color: tag.color,
              }}
            >
              {tag.name}
              {tag.video_count !== undefined && (
                <span className="ml-1.5 text-xs opacity-75">({tag.video_count})</span>
              )}
            </button>
          );
        })}
      </div>

      {selectedTagIds.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            {t('tags.filter.selected', { count: selectedTagIds.length })}
          </p>
        </div>
      )}
    </div>
  );
}
