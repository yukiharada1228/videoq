import { initI18n } from '@/i18n/config';

/**
 * 動画のステータスに関連するユーティリティ関数
 */

const i18n = initI18n();

export type VideoStatus = 'pending' | 'processing' | 'completed' | 'error';

/**
 * ステータスバッジのクラス名を取得
 */
export function getStatusBadgeClassName(
  status: string,
  size: 'xs' | 'sm' | 'md' = 'md'
): string {
  const baseClass = 'inline-flex items-center rounded-full font-medium';
  const sizeClass = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px]'
    : size === 'sm' 
    ? 'px-2.5 py-0.5 text-xs' 
    : 'px-3 py-1 text-sm';
  
  const statusColors: Record<VideoStatus | 'default', string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    default: 'bg-gray-100 text-gray-800',
  };
  
  return `${baseClass} ${sizeClass} ${statusColors[status as VideoStatus] || statusColors.default}`;
}

/**
 * ステータスラベルを取得
 */
export function getStatusLabel(status: string, locale?: string): string {
  const key = `common.status.${status}`;
  const label = i18n.t(key, locale ? { lng: locale } : undefined);
  return label === key ? status : label;
}

/**
 * 日付を日本語形式でフォーマット
 * @param date ISO形式の日付文字列またはDateオブジェクト
 * @param format 'full' | 'short' - 日時形式の詳細度
 * @returns フォーマットされた日付文字列
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
    i18n.language ||
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
 * 動画の時間文字列（HH:MM:SS,mmm / MM:SS / SS）を秒数に変換
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

