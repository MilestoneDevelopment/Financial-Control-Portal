/**
 * Percentage formatting. Mirrors the prototype's `pct`:
 *   +5.2%  for positive
 *   (5.2%) for negative (accounting parentheses, never a minus)
 *   0.0%   for zero (no sign)
 */
export function formatPercent(value: number, decimals = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  const body = `${Math.abs(safe).toFixed(decimals)}%`;
  if (safe < 0) return `(${body})`;
  if (safe > 0) return `+${body}`;
  return body;
}
