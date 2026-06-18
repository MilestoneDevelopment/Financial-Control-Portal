"use client";

/**
 * Display-currency state. GEL is the product default; USD/EUR are read-time
 * conversions applied at presentation using stored/NBG FX rates. The provider
 * only holds the chosen display currency; actual conversion lives in the FX
 * domain module (Phase 7).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Currency } from "@/lib/format/money";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const Ctx = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  children,
  initial = "GEL",
}: {
  children: ReactNode;
  initial?: Currency;
}) {
  const [currency, setCurrency] = useState<Currency>(initial);
  const value = useMemo(() => ({ currency, setCurrency }), [currency]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCurrency must be used within <CurrencyProvider>");
  return v;
}
