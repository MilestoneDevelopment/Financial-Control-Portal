import {
  groupColumnYears,
  type FlatMatrixModel,
  type FlatMatrixRow,
} from "@/lib/domain/cashflow/matrix";
import type { MatrixMode } from "./CashFlowFilters";
import styles from "./cash-flow.module.css";

/**
 * Flat side-by-side matrix for Quarter / Month aggregation modes. Columns are
 * pre-aggregated server-side; this is a read-only render. A two-row header
 * groups columns by year (year banner + compact sub-labels), with a stronger
 * divider at each year boundary. Month mode uses narrower numeric columns so
 * the latest 12 months + Total fit a desktop screen. Reuses the Year-matrix
 * styles (sticky label column, no red negatives, muted zeros, bridge tint).
 */
export function AggregateMatrixTable({
  model,
  mode,
}: {
  model: FlatMatrixModel;
  mode: MatrixMode;
}) {
  if (model.columns.length === 0) {
    return <div className={styles.empty}>No periods to show in this view.</div>;
  }

  const yearGroups = groupColumnYears(model.columns);
  // Column indexes that start a new year get a stronger left divider.
  const yearStart = new Set(yearGroups.map((g) => g.startIndex));
  const tableClass = `${styles.matrixTable} ${mode === "month" ? styles.aggregateMonthTable : ""}`;

  return (
    <div className={styles.matrixScroller}>
      <table className={tableClass}>
        <thead>
          {/* Year banner row (not sticky) - groups the columns below. */}
          <tr>
            <th className={`${styles.matrixGroupHead} ${styles.matrixLabelCol}`} aria-hidden />
            {yearGroups.map((g) => (
              <th
                key={g.year}
                className={`${styles.matrixGroupHead} ${styles.matrixYearGroup}`}
                colSpan={g.span}
                scope="colgroup"
              >
                {g.year}
              </th>
            ))}
            <th className={styles.matrixGroupHead} aria-hidden />
          </tr>
          {/* Sticky column-label row (Line + sub-labels + Total). */}
          <tr>
            <th className={`${styles.matrixHead} ${styles.matrixLabelCol}`} scope="col">
              Line
            </th>
            {model.columns.map((c, i) => (
              <th
                key={c.key}
                className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixMonthCol}${
                  yearStart.has(i) ? ` ${styles.matrixYearStart}` : ""
                }`}
                title={c.label}
                scope="col"
              >
                {c.short}
              </th>
            ))}
            <th className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixTotalCol}`} scope="col">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <RowView key={row.key} row={row} yearStart={yearStart} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function rowClass(row: FlatMatrixRow): string {
  if (row.kind === "section") return styles.rowSection;
  if (row.kind === "group") return row.isTotal ? styles.rowGroupTotal : styles.rowGroup;
  if (row.kind === "class") return styles.rowClass;
  if (row.kind === "bridge-opening" || row.kind === "bridge-closing") return styles.matrixBridgeBalance;
  if (row.kind === "bridge-net") return styles.matrixBridgeStrong;
  return styles.matrixBridge;
}

function RowView({ row, yearStart }: { row: FlatMatrixRow; yearStart: Set<number> }) {
  return (
    <tr className={rowClass(row)}>
      <th scope="row" className={styles.matrixLabelCol} style={{ paddingLeft: 10 + row.depth * 14 }}>
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
        </span>
      </th>
      {row.cells.map((c, i) => (
        <td
          key={i}
          className={`${styles.matrixAmountCol} ${styles.matrixMonthCol}${
            yearStart.has(i) ? ` ${styles.matrixYearStart}` : ""
          }`}
        >
          <span className={c.value === 0 ? styles.cellZero : styles.cellPlain}>{c.text}</span>
        </td>
      ))}
      <td className={`${styles.matrixAmountCol} ${styles.matrixTotalCol}`}>
        <span className={row.total.value === 0 ? styles.cellZero : styles.cellPlain}>{row.total.text}</span>
      </td>
    </tr>
  );
}
