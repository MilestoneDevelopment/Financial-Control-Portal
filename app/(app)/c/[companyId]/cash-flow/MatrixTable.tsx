"use client";

/**
 * Matrix table with year-grouped columns. Years collapse by default to a single
 * subtotal column; expanding a year reveals that year's months alongside the
 * subtotal. The "Total" column at the far right is always present.
 *
 * Sticky behavior is scoped to the table's own scroll container so the row
 * labels stay pinned during horizontal scroll without leaking outside the card.
 */
import { useState } from "react";
import type { MatrixModel, MatrixRow } from "@/lib/domain/cashflow/matrix";
import styles from "./cash-flow.module.css";

export function MatrixTable({ model }: { model: MatrixModel }) {
  // Default: all years collapsed (year subtotal only).
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  if (model.years.length === 0) {
    return <div className={styles.empty}>No accounting periods to show.</div>;
  }

  const toggle = (year: number) =>
    setExpanded((prev) => ({ ...prev, [year]: !prev[year] }));

  return (
    <div className={styles.matrixScroller}>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th className={`${styles.matrixHead} ${styles.matrixLabelCol}`} scope="col">
              Line
            </th>
            {model.years.map((y) => {
              const open = !!expanded[y.year];
              return (
                <YearHeader key={y.year} year={y} open={open} onToggle={() => toggle(y.year)} />
              );
            })}
            <th
              className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixTotalCol}`}
              scope="col"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <MatrixRowView key={row.key} row={row} expanded={expanded} model={model} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function YearHeader({
  year,
  open,
  onToggle,
}: {
  year: MatrixModel["years"][number];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {open &&
        year.months.map((m) => (
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
        className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixYearCol}`}
        scope="col"
      >
        <button
          type="button"
          className={styles.yearToggle}
          onClick={onToggle}
          aria-expanded={open}
          title={open ? `Collapse ${year.label}` : `Expand ${year.label} to months`}
        >
          <span className={styles.yearToggleCaret} aria-hidden>
            {open ? "−" : "+"}
          </span>
          {year.label}
        </button>
      </th>
    </>
  );
}

function rowClass(row: MatrixRow): string {
  if (row.kind === "section") return styles.rowSection;
  if (row.kind === "group") return row.isTotal ? styles.rowGroupTotal : styles.rowGroup;
  if (row.kind === "class") return styles.rowClass;
  // Bridge rows: net + closing emphasised, opening + fx quiet.
  if (row.kind === "bridge-net" || row.kind === "bridge-closing") return styles.matrixBridgeStrong;
  return styles.matrixBridge;
}

function MatrixRowView({
  row,
  expanded,
  model,
}: {
  row: MatrixRow;
  expanded: Record<number, boolean>;
  model: MatrixModel;
}) {
  return (
    <tr className={rowClass(row)}>
      <th
        scope="row"
        className={styles.matrixLabelCol}
        style={{ paddingLeft: 10 + row.depth * 14 }}
      >
        <span className={styles.labelCell}>
          {row.label}
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
              className={styles.srcTag}
              title="Year subtotal and Total column carry the last month's closing balance (not a sum)."
            >
              carry
            </span>
          )}
          {row.kind === "bridge-opening" && (
            <span
              className={styles.srcTag}
              title="Year subtotal = the year's first opening. Grand Total is not a sum."
            >
              first
            </span>
          )}
        </span>
      </th>
      {row.byYear.map((yc, yi) => {
        const year = model.years[yi];
        const open = !!expanded[year.year];
        return (
          <YearCells key={year.year} yc={yc} open={open} row={row} />
        );
      })}
      <td className={`${styles.matrixAmountCol} ${styles.matrixTotalCol}`}>
        <span className={cellTone(row, row.total.negative)}>{row.total.text}</span>
      </td>
    </tr>
  );
}

function YearCells({
  yc,
  open,
  row,
}: {
  yc: MatrixRow["byYear"][number];
  open: boolean;
  row: MatrixRow;
}) {
  return (
    <>
      {open &&
        yc.months.map((c, i) => (
          <td key={i} className={`${styles.matrixAmountCol} ${styles.matrixMonthCol}`}>
            <span className={cellTone(row, c.negative)}>{c.text}</span>
          </td>
        ))}
      <td className={`${styles.matrixAmountCol} ${styles.matrixYearCol}`}>
        <span className={cellTone(row, yc.total.negative)}>{yc.total.text}</span>
      </td>
    </>
  );
}

/**
 * Negative-cell color is reserved for emphasis rows (sections, "Total ..."
 * subtotals, net, closing). Detail line items render in normal text color even
 * when negative - parentheses already communicate the sign.
 */
function cellTone(row: MatrixRow, negative: boolean): string {
  if (!negative) return styles.cellPlain;
  const isEmphasis =
    row.kind === "section" ||
    row.isTotal ||
    row.kind === "bridge-net" ||
    row.kind === "bridge-closing";
  return isEmphasis ? styles.cellNegStrong : styles.cellPlain;
}
