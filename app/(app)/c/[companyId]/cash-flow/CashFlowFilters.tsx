"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./cash-flow.module.css";

export interface PeriodChoice {
  id: string;
  label: string;
}

/**
 * Read-only range selector for the cash-flow statement. Two modes:
 *  - Period: pick an existing accounting period (carries its opening balance).
 *  - Date range: free from/to dates generated straight from transactions.
 * Picking a period clears the manual dates and vice versa, so the active scope
 * is never ambiguous.
 */
export function CashFlowFilters({
  companyId,
  periods,
  current,
}: {
  companyId: string;
  periods: PeriodChoice[];
  current: { from: string; to: string; periodId: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [periodId, setPeriodId] = useState(current.periodId);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);

  function push(params: Record<string, string>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const qs = p.toString();
    startTransition(() => {
      router.push(`/c/${companyId}/cash-flow${qs ? `?${qs}` : ""}`);
    });
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    // Period selection takes precedence; a date range is the fallback mode.
    if (periodId) push({ periodId });
    else push({ from, to });
  }

  function clear() {
    setPeriodId("");
    setFrom("");
    setTo("");
    push({});
  }

  return (
    <form className={styles.filters} onSubmit={apply}>
      {periods.length > 0 && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Period</span>
          <select
            className={styles.select}
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value);
              if (e.target.value) {
                setFrom("");
                setTo("");
              }
            }}
            disabled={pending}
          >
            <option value="">Date range</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>From</span>
        <input
          className={styles.input}
          type="date"
          value={from}
          disabled={pending || periodId !== ""}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>To</span>
        <input
          className={styles.input}
          type="date"
          value={to}
          disabled={pending || periodId !== ""}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>

      <div className={styles.filterActions}>
        <button type="submit" className={styles.btnSm} disabled={pending}>
          {pending ? "Generating..." : "Generate"}
        </button>
        <button type="button" className={styles.clearBtn} disabled={pending} onClick={clear}>
          Clear
        </button>
      </div>
    </form>
  );
}
