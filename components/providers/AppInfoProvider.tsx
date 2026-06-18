"use client";

/** Shell-wide context: current user, accessible companies, default company. */
import { createContext, useContext, type ReactNode } from "react";

export interface CompanyLite {
  id: string;
  name: string;
  short_code: string | null;
  base_currency: "GEL" | "USD" | "EUR";
  status: "draft" | "active" | "archived";
}

interface AppInfo {
  email: string;
  companies: CompanyLite[];
  defaultCompanyId: string | null;
}

const Ctx = createContext<AppInfo | null>(null);

export function AppInfoProvider({ value, children }: { value: AppInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppInfo(): AppInfo {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppInfo must be used within <AppInfoProvider>");
  return v;
}
