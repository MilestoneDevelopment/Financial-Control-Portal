"use client";

/**
 * Global period state, shared across every module (Dashboard, Cash Flow,
 * Variance, Forecast, Reports, Portfolio). Changing it on any page updates all.
 * The interactive Period Selector control (Phase 1+) reads/writes this context.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_PERIOD_CONTEXT,
  defaultPeriodState,
  resolvePeriod,
} from "@/lib/domain/period/model";
import type { PeriodContext, PeriodState, ResolvedPeriod } from "@/lib/domain/period/types";

interface PeriodContextValue {
  state: PeriodState;
  setState: (next: PeriodState) => void;
  patch: (partial: Partial<PeriodState>) => void;
  resolved: ResolvedPeriod;
  ctx: PeriodContext;
}

const Ctx = createContext<PeriodContextValue | null>(null);

export function PeriodProvider({
  children,
  ctx = DEFAULT_PERIOD_CONTEXT,
}: {
  children: ReactNode;
  ctx?: PeriodContext;
}) {
  const [state, setState] = useState<PeriodState>(() => defaultPeriodState(ctx));

  const value = useMemo<PeriodContextValue>(
    () => ({
      state,
      setState,
      patch: (partial) => setState((s) => ({ ...s, ...partial })),
      resolved: resolvePeriod(state, ctx),
      ctx,
    }),
    [state, ctx],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePeriod(): PeriodContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePeriod must be used within <PeriodProvider>");
  return v;
}
