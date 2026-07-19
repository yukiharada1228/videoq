/**
 * Utility functions related to video status
 */

export type VideoStatus = 'uploading' | 'pending' | 'processing' | 'indexing' | 'completed' | 'error';

/** Subset of ChipLabel colors used for video status */
export type StatusChipColor = 'gray' | 'green' | 'orange' | 'red';

const STATUS_CHIP_COLORS: Record<VideoStatus | 'default', StatusChipColor> = {
  uploading: 'orange',
  pending: 'gray',
  processing: 'orange',
  indexing: 'orange',
  completed: 'green',
  error: 'red',
  default: 'gray',
};

/**
 * Map video status to Digital Agency ChipLabel color
 */
export function getStatusChipColor(status: string): StatusChipColor {
  return STATUS_CHIP_COLORS[status as VideoStatus] ?? STATUS_CHIP_COLORS.default;
}

/**
 * Get status badge class name (DA token based)
 */
export function getStatusBadgeClassName(
  status: string,
  size: 'xs' | 'sm' | 'md' = 'md'
): string {
  const baseClass = 'inline-flex items-center rounded-8 font-medium border';
  const sizeClass = size === 'xs'
    ? 'px-1.5 py-0.5 text-oln-14N-100'
    : size === 'sm'
    ? 'px-2 py-0.5 text-oln-14N-100'
    : 'px-3 py-1 text-oln-16N-100';

  const statusColors: Record<VideoStatus | 'default', string> = {
    uploading: 'border-orange-900 bg-orange-50 text-orange-1000',
    pending: 'border-solid-gray-700 bg-solid-gray-50 text-solid-gray-800',
    processing: 'border-orange-900 bg-orange-50 text-orange-1000',
    indexing: 'border-orange-900 bg-orange-50 text-orange-1000',
    completed: 'border-green-800 bg-green-50 text-green-900',
    error: 'border-red-900 bg-red-50 text-red-1000',
    default: 'border-solid-gray-700 bg-solid-gray-50 text-solid-gray-800',
  };

  return `${baseClass} ${sizeClass} ${statusColors[status as VideoStatus] || statusColors.default}`;
}

/**
 * Get status label translation key
 */
export function getStatusLabel(status: string): string {
  return `common.status.${status}`;
}

/**
 * Format date in locale format
 * @param date ISO date string or Date object
 * @param format 'full' | 'short' - Detail level of datetime format
 * @param locale Optional locale (defaults to browser locale or 'en-US')
 * @returns Formatted date string
 */
export function formatDate(
  date: string | Date,
  format: 'full' | 'short' = 'full',
  locale?: string
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const resolvedLocale =
    locale ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    'en-US';

  if (format === 'short') {
    return dateObj.toLocaleDateString(resolvedLocale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  return dateObj.toLocaleString(resolvedLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Convert video time string (HH:MM:SS,mmm / MM:SS / SS) to seconds
 */
export function timeStringToSeconds(timeStr: string): number {
  if (!timeStr) {
    return 0;
  }

  const timeWithoutMs = timeStr.split(/[,.]/)[0];
  const parts = timeWithoutMs.split(':').map((part) => part.trim());

  if (parts.length === 0 || parts.some((part) => part === '')) {
    return 0;
  }

  const numbers = parts.map((part) => Number.parseInt(part, 10));
  if (numbers.some(Number.isNaN)) {
    return 0;
  }

  if (numbers.length === 3) {
    const [hours, minutes, seconds] = numbers;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (numbers.length === 2) {
    const [minutes, seconds] = numbers;
    return minutes * 60 + seconds;
  }

  if (numbers.length === 1) {
    return numbers[0];
  }

  return 0;
}
