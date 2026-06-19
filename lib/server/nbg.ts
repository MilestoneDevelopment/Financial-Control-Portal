import "server-only";

/**
 * Server-only NBG FX fetch. Calls the National Bank of Georgia currencies
 * endpoint (NBG_FX_ENDPOINT) for a given date and returns the per-unit GEL rate.
 * Never called from client code. Best-effort: any failure returns null so the
 * resolver can fall back to fx_rates / prior dates rather than throwing.
 */
import { parseNbgRate, type NbgRate } from "@/lib/domain/upload/nbg";

export async function fetchNbgRate(currency: string, date: string): Promise<NbgRate | null> {
  const base = process.env.NBG_FX_ENDPOINT;
  if (!base) return null;
  const url = base.includes("?") ? `${base}&date=${date}` : `${base}?date=${date}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseNbgRate(json, currency);
  } catch {
    return null;
  }
}
