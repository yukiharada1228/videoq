'use client';

import { X } from 'lucide-react';

interface TagBadgeProps {
  tag: { id: number; name: string; color: string };
  onRemove?: (tagId: number) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function TagBadge({ tag, onRemove, size = 'md', className = '' }: TagBadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${className}`}
      style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: tag.color }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag.id);
          }}
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
