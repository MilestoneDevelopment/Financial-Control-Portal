"use client";

/**
 * Matrix table with year-grouped columns + a compact year-window selector.
 *
 * Default view: the latest 5 years of yearly subtotals plus the grand Total.
 * Focusing a single year hides the other year columns and exposes that year's
 * monthly breakdown - lets the user dive in without horizontal clutter, then
 * step back out with "Back to yearly view".
 *
 * Older years are never lost from the model; the From/To selectors widen or
 * narrow the visible window.
 */
import { useMemo, useState } from "react";
import {
  DEFAULT_YEAR_WINDOW_SIZE,
  latestYearWindow,
  selectMatrixYears,
  type MatrixModel,
  type MatrixRow,
  type YearWindow,
} from "@/lib/domain/cashflow/matrix";
import styles from "./cash-flow.module.css";

export function MatrixTable({ model }: { model: MatrixModel }) {
  const allYears = useMemo(() => model.years.map((y) => y.year), [model.years]);
  const defaultWindow = useMemo(() => latestYearWindow(allYears, DEFAULT_YEAR_WINDOW_SIZE), [allYears]);
  const [windowSpec, setWindow] = useState<YearWindow | null>(defaultWindow);
  const [focusedYear, setFocusedYear] = useState<number | null>(null);

  if (model.years.length === 0 || !windowSpec) {
    return <div className={styles.empty}>No accounting periods to show.</div>;
  }

  const visibleYears = selectMatrixYears(model, { window: windowSpec, focusedYear });
  const yearIndexMap = new Map(model.years.map((y, i) => [y.year, i]));

  function resetWindow() {
    setFocusedYear(null);
    setWindow(latestYearWindow(allYears, DEFAULT_YEAR_WINDOW_SIZE));
  }

  function setFrom(year: number) {
    const to = windowSpec!.to;
    setWindow({ from: Math.min(year, to), to });
  }
  function setTo(year: number) {
    const from = windowSpec!.from;
    setWindow({ from, to: Math.max(year, from) });
  }

  const isDefault =
    defaultWindow !== null &&
    windowSpec.from === defaultWindow.from &&
    windowSpec.to === defaultWindow.to;

  return (
    <>
      <div className={styles.matrixToolbar}>
        {focusedYear !== null ? (
          <div className={styles.matrixFocusBar}>
            <span className={styles.matrixFocusLabel}>
              Viewing <strong>{focusedYear}</strong> only
            </span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setFocusedYear(null)}
            >
              Back to yearly view
            </button>
          </div>
        ) : (
          <div className={styles.matrixYearRange}>
            <span className={styles.matrixToolLabel}>Years</span>
            <select
              className={styles.matrixSelect}
              value={windowSpec.from}
              onChange={(e) => setFrom(Number(e.target.value))}
              aria-label="From year"
            >
              {allYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className={styles.matrixToolDash} aria-hidden>to</span>
            <select
              className={styles.matrixSelect}
              value={windowSpec.to}
              onChange={(e) => setTo(Number(e.target.value))}
              aria-label="To year"
            >
              {allYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {!isDefault && (
              <button type="button" className={styles.linkBtn} onClick={resetWindow}>
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.matrixScroller}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th className={`${styles.matrixHead} ${styles.matrixLabelCol}`} scope="col">
                Line
              </th>
              {visibleYears.map((y) => (
                <YearHeader
                  key={y.year}
                  year={y}
                  focused={focusedYear === y.year}
                  onFocus={() => setFocusedYear(y.year)}
                />
              ))}
              {focusedYear === null && (
                <th
                  className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixTotalCol}`}
                  scope="col"
                >
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <MatrixRowView
                key={row.key}
                row={row}
                visibleYears={visibleYears}
                yearIndexMap={yearIndexMap}
                focusedYear={focusedYear}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function YearHeader({
  year,
  focused,
  onFocus,
}: {
  year: MatrixModel["years"][number];
  focused: boolean;
  onFocus: () => void;
}) {
  if (focused) {
    return (
      <>
        {year.months.map((m) => (
          <th
            key={m.id}
            className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixMonthCol}`}
            title={m.fullLabel}
            scope="col"
          >
            {m.label}
          </th>
        ))}
        <th
          className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixYearCol} ${styles.matrixYearTotal}`}
          scope="col"
        >
          {year.label} Total
        </th>
      </>
    );
  }
  return (
    <th
      className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixYearCol}`}
      scope="col"
    >
      <button
        type="button"
        className={styles.yearToggle}
        onClick={onFocus}
        title={`View ${year.label} months`}
      >
        <span className={styles.yearTogglePlus} aria-hidden>+</span>
        {year.label}
      </button>
    </th>
  );
}

function rowClass(row: MatrixRow): string {
  if (row.kind === "section") return styles.rowSection;
  if (row.kind === "group") return row.isTotal ? styles.rowGroupTotal : styles.rowGroup;
  if (row.kind === "class") return styles.rowClass;
  // Opening + closing balance rows get the strongest tint - they anchor the
  // cash-balance bridge and must be easy to find when scanning.
  if (row.kind === "bridge-opening" || row.kind === "bridge-closing") return styles.matrixBridgeBalance;
  // Net + FX stay readable as part of the bridge band, one step quieter.
  if (row.kind === "bridge-net") return styles.matrixBridgeStrong;
  return styles.matrixBridge;
}

function MatrixRowView({
  row,
  visibleYears,
  yearIndexMap,
  focusedYear,
}: {
  row: MatrixRow;
  visibleYears: MatrixModel["years"];
  yearIndexMap: Map<number, number>;
  focusedYear: number | null;
}) {
  return (
    <tr className={rowClass(row)}>
      <th
        scope="row"
        className={styles.matrixLabelCol}
        style={{ paddingLeft: 10 + row.depth * 14 }}
      >
        <span className={styles.labelCell}>
          <span className={styles.labelText} title={row.label}>{row.label}</span>
          {row.kind === "class" && row.direction && (
            <span className={styles.dirTag} data-dir={row.direction}>
              {row.direction === "in"
                ? "IN"
                : row.direction === "out"
                  ? "OUT"
                  : row.direction === "both"
                    ? "IN / OUT"
                    : "no direction"}
            </span>
          )}
          {row.kind === "bridge-closing" && (
            <span
              className={styles.bridgeHint}
              title="Uses the last visible period's closing balance (not a sum)."
            >
              Last month closing
            </span>
          )}
          {row.kind === "bridge-opening" && (
            <span
              className={styles.bridgeHint}
              title="Uses the first visible period's opening balance (not a sum)."
            >
              First month opening
            </span>
          )}
        </span>
      </th>
      {visibleYears.map((y) => {
        const idx = yearIndexMap.get(y.year)!;
        const yc = row.byYear[idx];
        const focused = focusedYear === y.year;
        return (
          <YearCells key={y.year} yc={yc} year={y} focused={focused} />
        );
      })}
      {focusedYear === null && (
        <td className={`${styles.matrixAmountCol} ${styles.matrixTotalCol}`}>
          <AmountCell text={row.total.text} value={row.total.value} />
        </td>
      )}
    </tr>
  );
}

function YearCells({
  yc,
  year,
  focused,
}: {
  yc: MatrixRow["byYear"][number];
  year: MatrixModel["years"][number];
  focused: boolean;
}) {
  return (
    <>
      {focused &&
        yc.months.map((c, i) => (
          <td key={year.months[i].id} className={`${styles.matrixAmountCol} ${styles.matrixMonthCol}`}>
            <AmountCell text={c.text} value={c.value} />
          </td>
        ))}
      <td className={`${styles.matrixAmountCol} ${styles.matrixYearCol}`}>
        <AmountCell text={yc.total.text} value={yc.total.value} />
      </td>
    </>
  );
}

/**
 * Amount cell tone in matrix mode: no red. Parentheses already communicate the
 * sign for negatives; exact zeros render muted to dampen visual noise.
 */
function AmountCell({ text, value }: { text: string; value: number | null }) {
  const isZero = value === 0;
  return <span className={isZero ? styles.cellZero : styles.cellPlain}>{text}</span>;
}
