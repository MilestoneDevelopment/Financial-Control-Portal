"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseQuarters, type StatementScopeKind } from "@/lib/domain/cashflow/scope";
import styles from "./cash-flow.module.css";

export interface PeriodChoice {
  id: string;
  label: string;
}

export type CashFlowView = "statement" | "matrix";
export type MatrixMode = "year" | "quarter" | "month";

interface Current {
  from: string;
  to: string;
  periodId: string;
  view: CashFlowView;
  scope: StatementScopeKind;
  year: string;
  q: string;
  half: string;
  /** Resolved (default-applied) zero-row visibility for the checkbox state. */
  showZero: boolean;
  /** Raw showZero param ("", "0", "1") - preserved across in-scope changes. */
  showZeroRaw: string;
  /** Matrix aggregation columns. */
  matrix: MatrixMode;
}

const SCOPE_TABS: { key: StatementScopeKind; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "half", label: "Half-year" },
  { key: "fy", label: "FY" },
  { key: "custom", label: "Custom" },
];

const MATRIX_TABS: { key: MatrixMode; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "quarter", label: "Quarter" },
  { key: "month", label: "Month" },
];

/**
 * Cash-flow report controls: a Statement / Matrix view switch and, in Statement
 * mode, a reporting-scope selector (Month / Quarter / Half-year / FY / Custom).
 * Quarter supports selecting several quarters in one year for a combined report.
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
  const [half, setHalf] = useState(current.half || "H1");

  const selectedQuarters = parseQuarters(current.q);
  // Preserve an explicit zero-line choice across in-scope (year/quarter) changes.
  const zeroParam: Record<string, string | undefined> = current.showZeroRaw
    ? { showZero: current.showZeroRaw }
    : {};

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
        return { scope: "quarter", year: current.year || year, q: current.q || "Q1" };
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
    else if (next === "quarter") go({ scope: "quarter", year, q: current.q || "Q1" });
    else if (next === "half") go({ scope: "half", year, half });
    else if (next === "fy") go({ scope: "fy", year });
    else go({ scope: "custom", from, to });
  }

  function toggleQuarter(qn: number, checked: boolean) {
    const set = new Set(selectedQuarters.length ? selectedQuarters : [1]);
    if (checked) set.add(qn);
    else set.delete(qn);
    const list = [...set].sort((a, b) => a - b);
    const qStr = list.map((n) => `Q${n}`).join(",");
    go({ scope: "quarter", year, q: qStr || "Q1", ...zeroParam });
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
          <div className={styles.viewSwitch} role="tablist" aria-label="Matrix columns">
            {MATRIX_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={current.matrix === t.key}
                className={styles.viewBtn}
                data-active={current.matrix === t.key}
                disabled={pending}
                onClick={() =>
                  current.matrix !== t.key &&
                  go(t.key === "year" ? { view: "matrix" } : { view: "matrix", matrix: t.key })
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className={styles.rangeHint}>
            {current.matrix === "quarter"
              ? "Quarters side by side."
              : current.matrix === "month"
                ? "Latest 12 months side by side."
                : "Years side by side; click a year to drill into months."}
          </span>
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
                    if (current.scope === "quarter")
                      go({ scope: "quarter", year: e.target.value, q: current.q || "Q1", ...zeroParam });
                    else if (current.scope === "half")
                      go({ scope: "half", year: e.target.value, half, ...zeroParam });
                    else go({ scope: "fy", year: e.target.value, ...zeroParam });
                  }}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            )}

            {current.scope === "quarter" && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Quarters</span>
                <div className={styles.quarterChecks}>
                  {[1, 2, 3, 4].map((qn) => (
                    <label key={qn} className={styles.quarterCheck}>
                      <input
                        type="checkbox"
                        checked={selectedQuarters.includes(qn)}
                        disabled={pending}
                        onChange={(e) => toggleQuarter(qn, e.target.checked)}
                      />
                      Q{qn}
                    </label>
                  ))}
                </div>
              </div>
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
                    go({ scope: "half", year, half: e.target.value, ...zeroParam });
                  }}
                >
                  <option value="H1">H1 [Jan-Jun]</option>
                  <option value="H2">H2 [Jul-Dec]</option>
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

            {/* Zero-line toggle is available for every scope (FY defaults on). */}
            <label className={styles.zeroToggle}>
              <input
                type="checkbox"
                checked={current.showZero}
                disabled={pending}
                onChange={(e) => go({ ...scopeBase(), showZero: e.target.checked ? "1" : "0" })}
              />
              Show zero lines
            </label>
          </div>
        </>
      )}
    </div>
  );
}
