"use client";

import type { ReactNode } from "react";
import { PeriodProvider } from "@/components/providers/PeriodProvider";
import { CurrencyProvider } from "@/components/providers/CurrencyProvider";
import { AppInfoProvider } from "@/components/providers/AppInfoProvider";
import { Sidebar } from "./Sidebar";
import styles from "./shell.module.css";

/**
 * Client shell frame: wires the global providers (period, currency, app info)
 * and the persistent sidebar around the scrollable main area.
 */
export function ShellFrame({
  email,
  companyId,
  children,
}: {
  email: string;
  companyId: string;
  children: ReactNode;
}) {
  return (
    <AppInfoProvider value={{ email, companyId }}>
      <PeriodProvider>
        <CurrencyProvider>
          <div className={styles.frame}>
            <Sidebar companyId={companyId} />
            <main className={styles.main}>{children}</main>
          </div>
        </CurrencyProvider>
      </PeriodProvider>
    </AppInfoProvider>
  );
}
