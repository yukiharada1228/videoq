/**
 * Utility functions related to video status
 */

import type { VideoStatus } from '@videoq/trpc';

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
  const parts = timeStr.split(':').map(part => part.trim());
  if (parts.length > 3 || parts.some((part, index) => !(
    index === parts.length - 1 ? /^\d+(?:[,.]\d+)?$/ : /^\d+$/
  ).test(part))) {
    return 0;
  }

  const numbers = parts.map(part => Number(part.replace(',', '.')));
  if (numbers.slice(1).some(part => part >= 60)) return 0;
  const seconds = numbers.reduce((total, part) => total * 60 + part, 0);
  return Number.isSafeInteger(Math.trunc(seconds)) ? seconds : 0;
}
