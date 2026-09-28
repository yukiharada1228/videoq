/** A literal substring pattern for PostgreSQL LIKE/ILIKE with its default escape. */
export function literalContainsPattern(value: string): string {
  return "%" + value.replace(/([\\%_])/g, "\\$1") + "%";
}
