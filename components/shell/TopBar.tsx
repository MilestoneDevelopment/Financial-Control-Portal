"use client";

import { usePeriod } from "@/components/providers/PeriodProvider";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { useAppInfo } from "@/components/providers/AppInfoProvider";
import { CurrencyToggle } from "./CurrencyToggle";
import { AccountMenu } from "./AccountMenu";
import styles from "./shell.module.css";

/**
 * Top bar: page title + live period/currency suffix, read-only period chip,
 * currency toggle, and account menu. The interactive Period Selector + Export
 * menu mount here in later phases; Phase 0 shows the live period label.
 */
export function TopBar({
  title,
  subtitle,
  usesPeriod = true,
}: {
  title: string;
  subtitle?: string;
  usesPeriod?: boolean;
}) {
  const { resolved } = usePeriod();
  const { currency } = useCurrency();
  const { email } = useAppInfo();
  const suffix = usesPeriod ? ` · ${resolved.label} · ${currency}` : "";

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarTitles}>
        <div className={styles.pageTitle}>
          {title}
          {suffix && <span className={styles.pageSuffix}>{suffix}</span>}
        </div>
        {subtitle && <div className={styles.pageSub}>{subtitle}</div>}
      </div>
      <div className={styles.topbarActions}>
        {usesPeriod && (
          <span className={styles.periodChip} title="Period selector (Phase 1+)">
            {resolved.label}
          </span>
        )}
        <CurrencyToggle />
        <AccountMenu email={email} />
      </div>
    </header>
  );
}
