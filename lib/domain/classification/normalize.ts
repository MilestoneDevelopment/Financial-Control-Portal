/**
 * Georgian-aware text normalization for classification (no DB imports - testable).
 * Lower-cases (a no-op for Georgian script, which is caseless), trims, and
 * collapses internal whitespace. Georgian characters are preserved; no
 * transliteration is performed.
 */
export function normalizeText(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Account codes: trim only (codes are case/space sensitive but may have stray spaces). */
export function normalizeAccount(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).trim();
}
