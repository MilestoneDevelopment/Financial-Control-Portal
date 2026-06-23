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
export type CashFlowView = "statement" | "matrix";

export function CashFlowFilters({
  companyId,
  periods,
  current,
}: {
  companyId: string;
  periods: PeriodChoice[];
  current: { from: string; to: string; periodId: string; view: CashFlowView };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [periodId, setPeriodId] = useState(current.periodId);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const view = current.view;

  function buildQuery(params: Record<string, string>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    return p.toString();
  }

  function push(params: Record<string, string | undefined>) {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v) cleaned[k] = v;
    const qs = buildQuery(cleaned);
    startTransition(() => {
      router.push(`/c/${companyId}/cash-flow${qs ? `?${qs}` : ""}`);
    });
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const viewQs = view === "matrix" ? view : undefined;
    // Period selection takes precedence; a date range is the fallback mode.
    if (periodId) push({ view: viewQs, periodId });
    else push({ view: viewQs, from, to });
  }

  function clear() {
    setPeriodId("");
    setFrom("");
    setTo("");
    push(view === "matrix" ? { view } : {});
  }

  function switchView(next: CashFlowView) {
    if (next === view) return;
    // Matrix mode ignores period/date filters - it always spans all monthly periods.
    if (next === "matrix") {
      push({ view: "matrix" });
    } else {
      push({});
      setPeriodId("");
      setFrom("");
      setTo("");
    }
  }

  return (
    <div className={styles.filters}>
      <div className={styles.viewSwitch} role="tablist" aria-label="View mode">
        <button
          type="button"
          role="tab"
          aria-selected={view === "statement"}
          className={styles.viewBtn}
          data-active={view === "statement"}
          disabled={pending}
          onClick={() => switchView("statement")}
        >
          Statement
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "matrix"}
          className={styles.viewBtn}
          data-active={view === "matrix"}
          disabled={pending}
          onClick={() => switchView("matrix")}
        >
          Matrix
        </button>
      </div>

      {view === "statement" ? (
        <form className={styles.filterFields} onSubmit={apply}>
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
      ) : (
        <div className={styles.filterFields}>
          <span className={styles.rangeHint}>
            Showing every monthly accounting period side by side.
          </span>
        </div>
      )}
    </div>
  );
}
