"use client";

/** Lightweight context for shell-wide info (current user email, active company). */
import { createContext, useContext, type ReactNode } from "react";

interface AppInfo {
  email: string;
  companyId: string;
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
