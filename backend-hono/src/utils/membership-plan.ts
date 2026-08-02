/**
 * Django の VideoEntity.plan_tag_attachment / VideoGroupEntity.plan_bulk_add
 * と同一の「重複排除 + 既存 skip」プランニング。
 *
 * requested を順に走査し、既に skipSet にある id（既付与/既メンバー、または
 * 走査済みの重複）を飛ばす。返す skipped は `len(requested) - len(idsToAdd)`。
 */
export function planAdditions(
  requested: number[],
  skipSet: Set<number>,
): { idsToAdd: number[]; skipped: number } {
  const seen = new Set<number>(skipSet);
  const idsToAdd: number[] = [];
  for (const id of requested) {
    if (seen.has(id)) continue;
    idsToAdd.push(id);
    seen.add(id);
  }
  return { idsToAdd, skipped: requested.length - idsToAdd.length };
}
