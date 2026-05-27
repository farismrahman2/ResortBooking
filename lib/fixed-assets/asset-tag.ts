/**
 * Generate an asset tag: GCR-AST-0001.
 * Race-safe via retry-on-UNIQUE in the action (mirrors account-code.ts).
 */
export function formatAssetTag(sequenceFromZero: number): string {
  return `GCR-AST-${String(sequenceFromZero + 1).padStart(4, '0')}`
}
