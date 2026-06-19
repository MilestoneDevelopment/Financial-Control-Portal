/**
 * Pure NBG (National Bank of Georgia) FX response parser (no network - testable).
 *
 * The NBG currencies endpoint returns, per requested date, an array like:
 *   [{ date: "2026-06-13T...", currencies: [{ code:"USD", quantity:1, rate:2.7, validFromDate:"2026-06-13T..." }, ...] }]
 * `rate` is GEL per `quantity` units, so the per-1-unit rate is rate / quantity.
 * The actual effective date may be earlier than requested (weekends/holidays).
 */
export interface NbgRate {
  rate: number; // GEL per 1 unit
  date: string; // ISO yyyy-mm-dd actually effective ("" if not reported)
}

export function parseNbgRate(json: unknown, currency: string): NbgRate | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const block = json[0] as Record<string, unknown>;
  const list = block?.currencies;
  if (!Array.isArray(list)) return null;

  const entry = list.find(
    (c) => String((c as Record<string, unknown>)?.code ?? "").toUpperCase() === currency.toUpperCase(),
  ) as Record<string, unknown> | undefined;
  if (!entry) return null;

  const rate = Number(entry.rate);
  const qty = Number(entry.quantity) || 1;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const perUnit = Math.round((rate / qty) * 1e6) / 1e6;

  const rawDate = String(entry.validFromDate ?? entry.date ?? block.date ?? "");
  const date = rawDate.slice(0, 10);
  return { rate: perUnit, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "" };
}
