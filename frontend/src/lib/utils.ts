import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge only dedupes utilities it can classify. The Digital Agency
 * Design System adds custom scales that tailwind-merge's default config does not
 * recognize, which breaks `cn()` in two ways:
 *
 *  1. Collision — DA defines both `--color-*` and `--text-*` in the Tailwind v4
 *     `@theme` block, so `text-key-900` (color) and `text-oln-16B-100`
 *     (font-size) both look like `text-*`. The default config treats them as one
 *     group and strips one when they coexist.
 *  2. Missed dedupe — numeric DA scales (`rounded-8`, `shadow-1`, `leading-150`)
 *     are not in the default validators, so overrides like
 *     `cn("rounded-full", "rounded-8")` keep BOTH and the intended override may
 *     not win.
 *
 * We patch the config so `cn()` classifies every DA scale correctly. A validator
 * only receives the value after the utility prefix (e.g. "8" for `rounded-8`), so
 * each is scoped to its own group.
 */
const isDaFontSize = (value: string) =>
  /^(dsp|std|dns|oln|mono)-\S+$/.test(value)
const isDaRadius = (value: string) => /^(4|6|8|12|16|24|32)$/.test(value)
const isDaShadow = (value: string) => /^[1-8]$/.test(value)
const isDaLineHeight = (value: string) => /^(\d{2,3}|1-\d{1,2})$/.test(value)

type Validator = (value: string) => boolean

const twMerge = extendTailwindMerge((config) => {
  // Types are derived from the config to avoid `any`.
  type ClassGroup = (typeof config.classGroups)["text-color"]
  type ClassDef = ClassGroup[number]

  // Append a validator to an existing class group keyed by its utility prefix.
  const register = (group: ClassGroup, key: string, match: Validator) => {
    const entry = group[0] as Record<string, ClassDef[]>
    entry[key]?.push(match as ClassDef)
  }

  // (1) Stop the text-color group from swallowing DA font-size tokens…
  const textColor = config.classGroups["text-color"][0] as { text: ClassDef[] }
  config.classGroups["text-color"] = [
    {
      text: textColor.text.map((v) =>
        typeof v === "function"
          ? (((value: string) =>
              isDaFontSize(value)
                ? false
                : (v as Validator)(value)) as ClassDef)
          : v
      ),
    } as ClassDef,
  ]
  // …and register them as font sizes instead.
  register(config.classGroups["font-size"], "text", isDaFontSize)

  // (2) Register the numeric DA scales so overrides dedupe correctly.
  register(config.classGroups["rounded"], "rounded", isDaRadius)
  register(config.classGroups["shadow"], "shadow", isDaShadow)
  register(config.classGroups["leading"], "leading", isDaLineHeight)

  return config
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatString(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Date formatting function
 * @param date - Date object or string
 * @param format - Format string
 * @returns Formatted date string
 */
export function formatDate(date: Date | string, format: string = 'YYYY-MM-DD'): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * File size formatting function
 * @param bytes - Number of bytes
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Time formatting function
 * @param seconds - Number of seconds
 * @returns Formatted time string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Number formatting function
 * @param num - Number
 * @param decimals - Number of decimal places
 * @returns Formatted number string
 */
export function formatNumber(num: number, decimals: number = 0): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Percentage formatting function
 * @param value - Value
 * @param total - Total value
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, total: number, decimals: number = 1): string {
  if (total === 0) return '0%';
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * String truncation function
 * @param str - String
 * @param maxLength - Maximum length
 * @param suffix - Suffix
 * @returns Truncated string
 */
export function truncateString(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * String sanitization function
 * @param str - String
 * @returns Sanitized string
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, '') // Remove quotes
    .trim();
}

/**
 * Array shuffle function
 * @param array - Array
 * @returns Shuffled array
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Array chunking function
 * @param array - Array
 * @param size - Chunk size
 * @returns Array split into chunks
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Deep clone function for objects
 * @param obj - Object
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T;
  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}

/**
 * Debounce function
 * @param func - Function
 * @param delay - Delay time (milliseconds)
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle function
 * @param func - Function
 * @param delay - Delay time (milliseconds)
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}