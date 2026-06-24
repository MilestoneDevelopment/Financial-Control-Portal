"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StatementScopeKind } from "@/lib/domain/cashflow/scope";
import styles from "./cash-flow.module.css";

export interface PeriodChoice {
  id: string;
  label: string;
}

export type CashFlowView = "statement" | "matrix";

interface Current {
  from: string;
  to: string;
  periodId: string;
  view: CashFlowView;
  scope: StatementScopeKind;
  year: string;
  q: string;
  half: string;
  showZero: boolean;
}

const SCOPE_TABS: { key: StatementScopeKind; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "half", label: "Half-year" },
  { key: "fy", label: "FY" },
  { key: "custom", label: "Custom" },
];

/**
 * Cash-flow report controls: a Statement / Matrix view switch and, in Statement
 * mode, a reporting-scope selector (Month / Quarter / Half-year / FY / Custom).
 * Scope changes navigate via query params; the server resolves the date range.
 */
export function CashFlowFilters({
  companyId,
  periods,
  years,
  current,
}: {
  companyId: string;
  periods: PeriodChoice[];
  years: number[];
  current: Current;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const view = current.view;

  const [periodId, setPeriodId] = useState(current.periodId);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const [year, setYear] = useState(current.year || String(years[0] ?? ""));
  const [q, setQ] = useState(current.q || "Q1");
  const [half, setHalf] = useState(current.half || "H1");

  function go(params: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const qs = p.toString();
    startTransition(() => router.push(`/c/${companyId}/cash-flow${qs ? `?${qs}` : ""}`));
  }

  /** Query params for the currently committed scope (so toggles preserve it). */
  function scopeBase(): Record<string, string | undefined> {
    switch (current.scope) {
      case "quarter":
        return { scope: "quarter", year: current.year || year, q: current.q || q };
      case "half":
        return { scope: "half", year: current.year || year, half: current.half || half };
      case "fy":
        return { scope: "fy", year: current.year || year };
      case "custom":
        return { scope: "custom", from: current.from, to: current.to };
      default:
        return { scope: "month", periodId: current.periodId };
    }
  }

  function switchScope(next: StatementScopeKind) {
    if (next === current.scope) return;
    if (next === "month") go({ scope: "month" });
    else if (next === "quarter") go({ scope: "quarter", year, q });
    else if (next === "half") go({ scope: "half", year, half });
    else if (next === "fy") go({ scope: "fy", year });
    else go({ scope: "custom", from, to });
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
          onClick={() => view !== "statement" && go({})}
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
          onClick={() => view !== "matrix" && go({ view: "matrix" })}
        >
          Matrix
        </button>
      </div>

      {view === "matrix" ? (
        <div className={styles.filterFields}>
          <span className={styles.rangeHint}>Showing every monthly accounting period side by side.</span>
        </div>
      ) : (
        <>
          <div className={styles.viewSwitch} role="tablist" aria-label="Reporting scope">
            {SCOPE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={current.scope === t.key}
                className={styles.viewBtn}
                data-active={current.scope === t.key}
                disabled={pending}
                onClick={() => switchScope(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.filterFields}>
            {current.scope === "month" && periods.length > 0 && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Period</span>
                <select
                  className={styles.select}
                  value={periodId}
                  disabled={pending}
                  onChange={(e) => {
                    setPeriodId(e.target.value);
                    go(e.target.value ? { scope: "month", periodId: e.target.value } : { scope: "month" });
                  }}
                >
                  <option value="">Latest period</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
            )}

            {(current.scope === "quarter" || current.scope === "half" || current.scope === "fy") && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Year</span>
                <select
                  className={styles.select}
                  value={year}
                  disabled={pending}
                  onChange={(e) => {
                    setYear(e.target.value);
                    if (current.scope === "quarter") go({ scope: "quarter", year: e.target.value, q });
                    else if (current.scope === "half") go({ scope: "half", year: e.target.value, half });
                    else go({ scope: "fy", year: e.target.value });
                  }}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            )}

            {current.scope === "quarter" && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Quarter</span>
                <select
                  className={styles.select}
                  value={q}
                  disabled={pending}
                  onChange={(e) => {
                    setQ(e.target.value);
                    go({ scope: "quarter", year, q: e.target.value });
                  }}
                >
                  {["Q1", "Q2", "Q3", "Q4"].map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </label>
            )}

            {current.scope === "half" && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Half</span>
                <select
                  className={styles.select}
                  value={half}
                  disabled={pending}
                  onChange={(e) => {
                    setHalf(e.target.value);
                    go({ scope: "half", year, half: e.target.value });
                  }}
                >
                  <option value="H1">H1 (Jan-Jun)</option>
                  <option value="H2">H2 (Jul-Dec)</option>
                </select>
              </label>
            )}

            {current.scope === "custom" && (
              <form
                className={styles.filterFields}
                onSubmit={(e) => {
                  e.preventDefault();
                  go({ scope: "custom", from, to });
                }}
              >
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>From</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={from}
                    disabled={pending}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>To</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={to}
                    disabled={pending}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <div className={styles.filterActions}>
                  <button type="submit" className={styles.btnSm} disabled={pending}>
                    {pending ? "Generating..." : "Generate"}
                  </button>
                </div>
              </form>
            )}

            {/* Zero-line toggle: not shown for FY (FY always shows the full structure). */}
            {current.scope !== "fy" && (
              <label className={styles.zeroToggle}>
                <input
                  type="checkbox"
                  checked={current.showZero}
                  disabled={pending}
                  onChange={(e) =>
                    go({ ...scopeBase(), showZero: e.target.checked ? "1" : undefined })
                  }
                />
                Show zero lines
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}
