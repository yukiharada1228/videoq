/**
 * 共通のデータ処理ユーティリティ（DRY原則・N+1問題対策）
 */

/**
 * 動画IDのSetを作成する共通関数（DRY原則・N+1問題対策）
 * @param videoIds - 動画IDの配列
 * @returns 動画IDのSet
 */
export function createVideoIdSet(videoIds: number[]): Set<number> {
  return new Set(videoIds);
}

/**
 * 配列をフィルタリングする共通関数（DRY原則）
 * @param items - フィルタリングする配列
 * @param predicate - フィルタリング条件
 * @returns フィルタリングされた配列
 */
export function filterItems<T>(
  items: T[],
  predicate: (item: T) => boolean
): T[] {
  return items.filter(predicate);
}

/**
 * 配列をマッピングする共通関数（DRY原則）
 * @param items - マッピングする配列
 * @param mapper - マッピング関数
 * @returns マッピングされた配列
 */
export function mapItems<T, U>(
  items: T[],
  mapper: (item: T) => U
): U[] {
  return items.map(mapper);
}

/**
 * 配列をグループ化する共通関数（DRY原則・N+1問題対策）
 * @param items - グループ化する配列
 * @param keySelector - キーを選択する関数
 * @returns グループ化されたオブジェクト
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
 * 配列をソートする共通関数（DRY原則）
 * @param items - ソートする配列
 * @param keySelector - ソートキーを選択する関数
 * @param ascending - 昇順かどうか
 * @returns ソートされた配列
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
 * 配列から重複を削除する共通関数（DRY原則・N+1問題対策）
 * @param items - 重複を削除する配列
 * @param keySelector - 重複判定のキーを選択する関数
 * @returns 重複が削除された配列
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
