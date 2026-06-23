import type { MatrixModel, MatrixRow } from "@/lib/domain/cashflow/matrix";
import styles from "./cash-flow.module.css";

/**
 * Matrix table: period columns + Total. The left column is sticky; the table is
 * horizontally scrollable on narrow viewports. Row classes mirror the statement:
 * sections + "Total ..." subtotal rows render with emphasis.
 */
export function MatrixTable({ model }: { model: MatrixModel }) {
  if (model.periods.length === 0) {
    return <div className={styles.empty}>No accounting periods to show.</div>;
  }

  return (
    <div className={styles.matrixScroller}>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th className={`${styles.matrixHead} ${styles.matrixLabelCol}`}>Line</th>
            {model.periods.map((p) => (
              <th key={p.id} className={`${styles.matrixHead} ${styles.matrixAmountCol}`}>
                {p.label}
              </th>
            ))}
            <th
              className={`${styles.matrixHead} ${styles.matrixAmountCol} ${styles.matrixTotalCol}`}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>{model.rows.map((row) => <MatrixRowView key={row.key} row={row} />)}</tbody>
      </table>
    </div>
  );
}

function rowClass(row: MatrixRow): string {
  if (row.kind === "section") return styles.rowSection;
  if (row.kind === "group") return styles.rowGroup;
  if (row.kind === "class") return styles.rowClass;
  // Bridge rows: opening/fx are quiet; net/closing are emphasised.
  if (row.kind === "bridge-net" || row.kind === "bridge-closing") return styles.matrixBridgeStrong;
  return styles.matrixBridge;
}

function MatrixRowView({ row }: { row: MatrixRow }) {
  return (
    <tr className={rowClass(row)}>
      <th
        scope="row"
        className={styles.matrixLabelCol}
        style={{ paddingLeft: 10 + row.depth * 16 }}
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
              title="Total column shows the last period's closing balance, not a sum."
            >
              last period
            </span>
          )}
          {row.kind === "bridge-opening" && (
            <span
              className={styles.srcTag}
              title="Opening balances do not sum across periods."
            >
              n/a
            </span>
          )}
        </span>
      </th>
      {row.cells.map((c, i) => (
        <td key={i} className={styles.matrixAmountCol} data-negative={c.negative}>
          {c.text}
        </td>
      ))}
      <td
        className={`${styles.matrixAmountCol} ${styles.matrixTotalCol}`}
        data-negative={row.total.negative}
      >
        {row.total.text}
      </td>
    </tr>
  );
}
