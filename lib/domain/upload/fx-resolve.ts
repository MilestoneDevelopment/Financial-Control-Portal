/**
 * Pure FX-resolution decision logic (no DB / no network - testable).
 *
 * Resolution priority is decided by the CALLER (action), which supplies a
 * pre-chosen `found` rate (imported in-file rate > fx_rates exact > NBG exact >
 * fx_rates/NBG prior). This function turns inputs into the persisted FX fields and
 * never invents a rate: base currency needs none; unknown currency or no rate stays
 * pending with an issue.
 */
import type { Database } from "@/db/types";
import type { Currency } from "./columns.ts";
import type { FxStatus } from "./status.ts";

export type FxRateSource = Database["public"]["Enums"]["fx_rate_source"];

export interface FxLookup {
  rate: number; // GEL per 1 unit of the foreign currency
  date: string; // ISO yyyy-mm-dd of the rate actually used
  source: FxRateSource;
}

export interface FxRowInput {
  currency: Currency | null;
  originalAmount: number | null;
  baseCurrency: Currency;
  found: FxLookup | null;
}

export interface FxRowResult {
  fxStatus: FxStatus;
  fxRateToGel: number | null;
  fxRateSource: FxRateSource | null;
  fxRateDate: string | null;
  amountGel: number | null;
  resolved: boolean;
  issue: { code: string; message: string } | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolveRowFx(i: FxRowInput): FxRowResult {
  // Base currency: no FX needed.
  if (i.currency && i.currency === i.baseCurrency) {
    return {
      fxStatus: "not_required",
      fxRateToGel: null,
      fxRateSource: null,
      fxRateDate: null,
      amountGel: i.originalAmount,
      resolved: true,
      issue: null,
    };
  }
  // Unknown currency: cannot resolve.
  if (!i.currency) {
    return {
      fxStatus: "pending",
      fxRateToGel: null,
      fxRateSource: null,
      fxRateDate: null,
      amountGel: null,
      resolved: false,
      issue: { code: "BAD_CURRENCY", message: "Unknown currency; cannot resolve FX." },
    };
  }
  // Foreign currency with a found rate.
  if (i.found && i.found.rate > 0) {
    return {
      fxStatus: "resolved",
      fxRateToGel: i.found.rate,
      fxRateSource: i.found.source,
      fxRateDate: i.found.date,
      amountGel: i.originalAmount !== null ? round2(i.originalAmount * i.found.rate) : null,
      resolved: true,
      issue: null,
    };
  }
  // Foreign currency, no rate available.
  return {
    fxStatus: "pending",
    fxRateToGel: null,
    fxRateSource: null,
    fxRateDate: null,
    amountGel: null,
    resolved: false,
    issue: { code: "MISSING_FX", message: `No FX rate available for ${i.currency}.` },
  };
}

/** Pick the source label for a found rate given whether its date matches the request. */
export function fxSourceForDate(requestedDate: string, rateDate: string, base: FxRateSource): FxRateSource {
  return rateDate === requestedDate ? base : "nbg_prior_filled";
}
