import type { FlatMatrixModel, FlatMatrixRow } from "@/lib/domain/cashflow/matrix";
import styles from "./cash-flow.module.css";

/**
 * Flat side-by-side matrix for Quarter / Month aggregation modes. Columns are
 * pre-aggregated server-side; this is a read-only render. Reuses the Year matrix
 * styles (sticky label column, no red negatives, muted zeros, bridge tint).
 */
export function AggregateMatrixTable({ model }: { model: FlatMatrixModel }) {
  if (model.columns.length === 0) {
    return <div className={styles.empty}>No periods to show in this view.</div>;
  }
  return (
    <div className={styles.matrixScroller}>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th className={`${styles.matrixHead} ${styles.matrixLabelCol}`} scope="col">
              Line
            </th>
            {model.columns.map((c) => (
              <th
                key={c.key}
                className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixMonthCol}`}
                scope="col"
              >
                {c.label}
              </th>
            ))}
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
            <RowView key={row.key} row={row} />
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

function RowView({ row }: { row: FlatMatrixRow }) {
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
        <td key={i} className={`${styles.matrixAmountCol} ${styles.matrixMonthCol}`}>
          <span className={c.value === 0 ? styles.cellZero : styles.cellPlain}>{c.text}</span>
        </td>
      ))}
      <td className={`${styles.matrixAmountCol} ${styles.matrixTotalCol}`}>
        <span className={row.total.value === 0 ? styles.cellZero : styles.cellPlain}>{row.total.text}</span>
      </td>
    </tr>
  );
}
