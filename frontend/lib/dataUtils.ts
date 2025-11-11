/**
 * Common data processing utilities
 */

/**
 * Common function to create Set of video IDs
 * @param videoIds - Array of video IDs
 * @returns Set of video IDs
 */
export function createVideoIdSet(videoIds: number[]): Set<number> {
  return new Set(videoIds);
}

/**
 * Common function to filter array
 * @param items - Array to filter
 * @param predicate - Filtering condition
 * @returns Filtered array
 */
export function filterItems<T>(
  items: T[],
  predicate: (item: T) => boolean
): T[] {
  return items.filter(predicate);
}

/**
 * Common function to map array
 * @param items - Array to map
 * @param mapper - Mapping function
 * @returns Mapped array
 */
export function mapItems<T, U>(
  items: T[],
  mapper: (item: T) => U
): U[] {
  return items.map(mapper);
}

/**
 * Common function to group array
 * @param items - Array to group
 * @param keySelector - Function to select key
 * @returns Grouped object
 */
export function groupBy<T, K extends string | number>(
  items: T[],
  keySelector: (item: T) => K
): Record<K, T[]> {
  return items.reduce((groups, item) => {
    const key = keySelector(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
}

/**
 * Common function to sort array
 * @param items - Array to sort
 * @param keySelector - Function to select sort key
 * @param ascending - Whether ascending order
 * @returns Sorted array
 */
export function sortItems<T>(
  items: T[],
  keySelector: (item: T) => string | number,
  ascending: boolean = true
): T[] {
  return [...items].sort((a, b) => {
    const aKey = keySelector(a);
    const bKey = keySelector(b);
    
    if (aKey < bKey) return ascending ? -1 : 1;
    if (aKey > bKey) return ascending ? 1 : -1;
    return 0;
  });
}

/**
 * Common function to remove duplicates from array
 * @param items - Array to remove duplicates from
 * @param keySelector - Function to select key for duplicate detection
 * @returns Array with duplicates removed
 */
export function removeDuplicates<T>(
  items: T[],
  keySelector: (item: T) => string | number
): T[] {
  const seen = new Set<string | number>();
  return items.filter(item => {
    const key = keySelector(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
