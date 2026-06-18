/**
 * Money / number formatting.
 *
 * Product rule (non-negotiable): negative financial numbers use accounting
 * parentheses, e.g. (1,250) - never -1,250. Color/sign semantics are handled
 * separately at the UI layer; this module only formats the magnitude + sign.
 */

export type Currency = "GEL" | "USD" | "EUR";

export const SUPPORTED_CURRENCIES: Currency[] = ["GEL", "USD", "EUR"];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  GEL: "₾", // ₾
  USD: "$",
  EUR: "€", // €
};

/**
 * Format a numeric magnitude with thousands separators and accounting
 * parentheses for negatives.
 *
 *   formatAmount(1250)      -> "1,250"
 *   formatAmount(-1250)     -> "(1,250)"
 *   formatAmount(-1250.5, { decimals: 2 }) -> "(1,250.50)"
 *   formatAmount(0)         -> "0"
 */
export function formatAmount(
  value: number,
  opts: { decimals?: number } = {},
): string {
  const decimals = opts.decimals ?? 0;
  const safe = Number.isFinite(value) ? value : 0;
  const negative = safe < 0;
  // Guard against "-0" after rounding.
  const abs = Math.abs(safe);
  const body = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
  return negative ? `(${body})` : body;
}

/**
 * Format an amount with an optional currency symbol. The symbol sits outside
 * the accounting parentheses: formatMoney(-1250, "GEL", { symbol: true }) -> "₾(1,250)".
 * Symbol is opt-in because most table cells render bare numbers with the
 * currency shown once in the period/title strip.
 */
export function formatMoney(
  value: number,
  currency: Currency = "GEL",
  opts: { decimals?: number; symbol?: boolean } = {},
): string {
  const body = formatAmount(value, { decimals: opts.decimals });
  return opts.symbol ? `${CURRENCY_SYMBOL[currency]}${body}` : body;
}
