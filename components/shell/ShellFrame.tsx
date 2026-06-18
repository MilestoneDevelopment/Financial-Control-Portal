"use client";

import type { ReactNode } from "react";
import { PeriodProvider } from "@/components/providers/PeriodProvider";
import { CurrencyProvider } from "@/components/providers/CurrencyProvider";
import { AppInfoProvider, type CompanyLite } from "@/components/providers/AppInfoProvider";
import { Sidebar } from "./Sidebar";
import styles from "./shell.module.css";

/**
 * Client shell frame: wires the global providers (period, currency, app info)
 * and the persistent sidebar around the scrollable main area.
 */
export function ShellFrame({
  email,
  companies,
  defaultCompanyId,
  children,
}: {
  email: string;
  companies: CompanyLite[];
  defaultCompanyId: string | null;
  children: ReactNode;
}) {
  return (
    <AppInfoProvider value={{ email, companies, defaultCompanyId }}>
      <PeriodProvider>
        <CurrencyProvider>
          <div className={styles.frame}>
            <Sidebar />
            <main className={styles.main}>{children}</main>
          </div>
        </CurrencyProvider>
      </PeriodProvider>
    </AppInfoProvider>
  );
}
