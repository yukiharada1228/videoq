/** Deterministic test vector; components describe the small subspace under test. */
export function embedding(...components: number[]): number[] {
  return [...components, ...Array(1536 - components.length).fill(0)];
}
