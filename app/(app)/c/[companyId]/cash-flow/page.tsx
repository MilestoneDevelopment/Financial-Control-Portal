import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { formatAmount } from "@/lib/format/money";
import { PERIOD_STATUS_LABEL } from "@/lib/domain/period/lifecycle";
import {
  listCashFlowNodes,
  listCashFlowTransactions,
  listCashFlowTransactionsByPeriod,
  listCashFlowPeriods,
  type CashFlowDateRange,
} from "@/lib/data/cashflow";
import { buildCashFlowTree, computeClosingBalance } from "@/lib/domain/cashflow/generate";
import {
  buildCashFlowMatrix,
  buildAggregateMatrix,
  quarterColumns,
  latestMonthColumns,
  type MatrixPeriodInput,
  type FlatMatrixModel,
} from "@/lib/domain/cashflow/matrix";
import { summarizeCashFlowCoverage, type CashFlowCoverageFact } from "@/lib/domain/cashflow/coverage";
import { formatCashFlowRows } from "@/lib/domain/cashflow/format";
import {
  resolveStatementScopeKind,
  resolveShowZero,
  pruneZeroRows,
  aggregatePeriodBridge,
  parseQuarters,
  quartersDateRange,
  quarterOfMonth,
  formatQuartersLabel,
  halfRange,
  fyRange,
  HALF_LABEL,
  MONTH_SHORT,
  type StatementScopeKind,
} from "@/lib/domain/cashflow/scope";
import {
  adjacentPeriods,
  resolveOpeningBalance,
  type OpeningResolution,
  type OpeningState,
  type PeriodStatus,
} from "@/lib/domain/cashflow/periods";
import { CashFlowFilters, type CashFlowView, type MatrixMode } from "./CashFlowFilters";
import { MatrixTable } from "./MatrixTable";
import { AggregateMatrixTable } from "./AggregateMatrixTable";
import { MatrixFullscreenShell } from "./MatrixFullscreenShell";
import styles from "./cash-flow.module.css";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (n: number) => formatAmount(n, { decimals: 2 });

// Read-only opening-balance source copy for the Cash Flow Bridge (display only;
// stored source enum values are unchanged). `missing` shows no source label.
const SOURCE_LABEL: Partial<Record<OpeningState, string>> = {
  manual: "Source: Manual",
  carried: "Source: Carried from previous period",
  imported: "Source: Imported from Excel",
  "carried-candidate": "Source: Carried from previous period",
};
const SOURCE_TITLE: Partial<Record<OpeningState, string>> = {
  manual: "Opening balance entered manually.",
  carried: "Opening balance carried from the previous period's closing.",
  imported: "Opening balance imported from the CF Actual Excel history.",
  "carried-candidate": "Opening balance carried from the previous period's closing.",
};

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<SP>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const fromParam = one(sp.from);
  const toParam = one(sp.to);
  const periodIdParam = one(sp.periodId);
  const viewParam: CashFlowView = one(sp.view) === "matrix" ? "matrix" : "statement";
  const matrixParam: MatrixMode =
    one(sp.matrix) === "quarter" ? "quarter" : one(sp.matrix) === "month" ? "month" : "year";
  const scopeParam = one(sp.scope);
  const yearParam = one(sp.year);
  const qParam = one(sp.q);
  const halfParam = one(sp.half);
  const showZeroParam = one(sp.showZero);
  const scopeKind: StatementScopeKind = resolveStatementScopeKind({
    scope: scopeParam,
    periodId: periodIdParam,
    from: fromParam,
    to: toParam,
  });
  const showZeroResolved = resolveShowZero(scopeKind, showZeroParam);

  let canManagePeriods = false;
  let hasStructure = false;
  let hasAnyPeriod = false;
  let periods: { id: string; label: string }[] = [];
  let years: number[] = [];
  let roots: ReturnType<typeof buildCashFlowTree>["roots"] = [];
  let rows: ReturnType<typeof formatCashFlowRows> = [];
  let net = 0;
  let coverage = summarizeCashFlowCoverage([]);
  let scopeLabel = "All transactions";
  let matrix: ReturnType<typeof buildCashFlowMatrix> | null = null;
  let aggregateMatrix: FlatMatrixModel | null = null;

  // Period-aware state (only populated when a period is selected).
  let inPeriodMode = false;
  let periodStatus: PeriodStatus | null = null;
  let opening: OpeningResolution = { state: "missing", value: null, candidate: null };
  let periodFx = 0;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const caps = await capabilityMap(supabase, companyId, ["period.approve_lock"]);
    canManagePeriods = caps["period.approve_lock"];

    const allPeriods = await listCashFlowPeriods(companyId);
    periods = allPeriods.map((p) => ({ id: p.id, label: p.label }));
    years = [...new Set(allPeriods.filter((p) => p.month !== null).map((p) => p.year))].sort((a, b) => b - a);
    hasAnyPeriod = allPeriods.length > 0;

    const nodes = await listCashFlowNodes(companyId);
    hasStructure = nodes.some((n) => n.kind === "section");

    if (viewParam === "matrix" && hasStructure) {
      // Matrix view: one column per monthly period, chronological. Year-level
      // (month=null) periods are excluded - the matrix is month-by-month by design.
      const monthly = allPeriods
        .filter((p) => p.month !== null)
        .slice()
        .sort((a, b) => (a.year !== b.year ? a.year - b.year : (a.month ?? 0) - (b.month ?? 0)));
      const matrixPeriods: MatrixPeriodInput[] = monthly.map((p) => ({
        id: p.id,
        year: p.year,
        month: p.month,
        label: p.label,
        openingBalance: p.openingBalance,
        fxFluctuations: p.fxFluctuations,
        storedClosingBalance: p.closingBalance,
      }));
      const txnsByPeriod = await listCashFlowTransactionsByPeriod(
        companyId,
        monthly.map((p) => ({ id: p.id, dateFrom: p.dateFrom, dateTo: p.dateTo })),
      );
      // Year mode keeps the year-grouped model + drilldown; Quarter / Month modes
      // render flat side-by-side columns from the same per-period transactions.
      // Matrix hides zero-only rows by default; showZero=1 reveals them.
      const matrixHideZero = showZeroParam !== "1";
      if (matrixParam === "quarter") {
        aggregateMatrix = buildAggregateMatrix(nodes, quarterColumns(matrixPeriods), txnsByPeriod, matrixHideZero);
      } else if (matrixParam === "month") {
        aggregateMatrix = buildAggregateMatrix(nodes, latestMonthColumns(matrixPeriods, 12), txnsByPeriod, matrixHideZero);
      } else {
        matrix = buildCashFlowMatrix(nodes, matrixPeriods, txnsByPeriod, matrixHideZero);
      }
      scopeLabel = monthly.length > 0
        ? `${monthly[0].label} - ${monthly[monthly.length - 1].label}`
        : "No monthly periods";
      // Matrix mode does not show a data-quality summary, so no coverage query here.
    }

    // ---- Statement scope resolution + aggregation (skipped in matrix mode) ----
    if (viewParam !== "matrix") {
      const monthlyAsc = allPeriods
        .filter((p) => p.month !== null)
        .slice()
        .sort((a, b) => (a.year !== b.year ? a.year - b.year : (a.month as number) - (b.month as number)));
      const latestMonthly = allPeriods.find((p) => p.month !== null);
      const year = Number(yearParam) || latestMonthly?.year || 0;

      let range: CashFlowDateRange = {};
      let activePeriod: (typeof allPeriods)[number] | undefined;
      // For quarter scope, restrict to the selected quarters' months (handles
      // non-contiguous selections like Q1,Q3 where the bounding range spans Q2).
      let quarterFilter: number[] | null = null;

      // Aggregate a list of monthly periods into the cash-bridge opening/FX.
      const setAggregateBridge = (inRange: typeof monthlyAsc) => {
        const agg = aggregatePeriodBridge(
          inRange.map((p) => ({
            year: p.year,
            month: p.month as number,
            openingBalance: p.openingBalance,
            fxFluctuations: p.fxFluctuations,
          })),
        );
        periodFx = agg.fx;
        const firstInRange = inRange[0];
        // Opening = the first included month's opening (never invented).
        opening = {
          state: firstInRange?.openingBalanceSource ?? (agg.opening !== null ? "carried" : "missing"),
          value: agg.opening,
          candidate: null,
        };
        return agg;
      };

      if (scopeKind === "month") {
        // Explicit period wins; otherwise default to the latest monthly period.
        activePeriod = periodIdParam
          ? allPeriods.find((p) => p.id === periodIdParam && p.month !== null)
          : latestMonthly;
        if (activePeriod) {
          inPeriodMode = true;
          periodStatus = activePeriod.status;
          periodFx = activePeriod.fxFluctuations ?? 0;
          range = { dateFrom: activePeriod.dateFrom, dateTo: activePeriod.dateTo };
          scopeLabel = `Selected period: ${activePeriod.label}`;
        } else {
          scopeLabel = "All transactions";
        }
      } else if (scopeKind === "quarter") {
        const selected = parseQuarters(qParam);
        const quarters = selected.length ? selected : [1];
        quarterFilter = quarters;
        const r = quartersDateRange(year, quarters)!;
        range = { dateFrom: r.dateFrom, dateTo: r.dateTo };
        const inRange = monthlyAsc.filter(
          (p) => p.year === year && quarters.includes(quarterOfMonth(p.month as number)),
        );
        setAggregateBridge(inRange);
        scopeLabel = formatQuartersLabel(year, quarters);
      } else if (scopeKind === "half" || scopeKind === "fy") {
        const half = Number(String(halfParam).replace(/[^0-9]/g, "")) === 2 ? 2 : 1;
        const r = scopeKind === "half" ? halfRange(year, half) : fyRange(year);
        range = { dateFrom: r.dateFrom, dateTo: r.dateTo };
        const inRange = monthlyAsc.filter((p) => p.dateFrom >= r.dateFrom && p.dateTo <= r.dateTo);
        const agg = setAggregateBridge(inRange);
        scopeLabel =
          scopeKind === "half"
            ? HALF_LABEL(year, half)
            : agg.lastMonth !== null && agg.lastMonth < 12
              ? `FY ${year} through ${MONTH_SHORT(agg.lastMonth)}`
              : `FY ${year}`;
      } else {
        // Custom range: preserve prior safe behavior (no invented balances).
        range = { dateFrom: fromParam || undefined, dateTo: toParam || undefined };
        scopeLabel =
          fromParam || toParam
            ? `Custom range: ${fromParam || "start"} to ${toParam || "latest"}`
            : "All transactions";
      }

      // Build the statement over the resolved range. Quarter scope filters to the
      // selected quarters' months so a non-contiguous selection excludes the gap.
      let txns = await listCashFlowTransactions(companyId, range);
      if (quarterFilter) {
        const qf = quarterFilter;
        txns = txns.filter((t) => t.date != null && qf.includes(quarterOfMonth(Number(t.date.slice(5, 7)))));
      }
      const statement = buildCashFlowTree(nodes, txns);
      roots = statement.roots;
      net = statement.net;
      // Bridge totals use the full tree; the detail table optionally hides zeros.
      const showZero = resolveShowZero(scopeKind, showZeroParam);
      rows = formatCashFlowRows(showZero ? statement : pruneZeroRows(statement));

      const dirById = new Map(
        nodes.filter((n) => n.kind === "class").map((n) => [n.id, n.cashDirection]),
      );
      const facts: CashFlowCoverageFact[] = txns.map((t) => ({
        id: t.id,
        classId: t.classId,
        status: t.status,
        source: t.source,
        amountGel: t.amountGel,
        fxStatus: t.fxStatus,
        classDirection: t.classId ? dirById.get(t.classId) ?? null : null,
      }));
      coverage = summarizeCashFlowCoverage(facts);

      // Month scope: resolve opening with a carried candidate from the prior
      // period (aggregate scopes set their opening above).
      if (scopeKind === "month" && activePeriod) {
        const { previous } = adjacentPeriods(allPeriods, activePeriod.id);
        let previousClosing: number | null = null;
        if (previous && previous.openingBalance !== null) {
          const prevTxns = await listCashFlowTransactions(companyId, {
            dateFrom: previous.dateFrom,
            dateTo: previous.dateTo,
          });
          const prevNet = buildCashFlowTree(nodes, prevTxns).net;
          previousClosing = computeClosingBalance(previous.openingBalance, prevNet, previous.fxFluctuations ?? 0);
        }
        opening = resolveOpeningBalance({
          openingBalance: activePeriod.openingBalance,
          openingBalanceSource: activePeriod.openingBalanceSource,
          previousClosing,
        });
      }
    }
  }

  const closing = computeClosingBalance(opening.value, net, periodFx);

  return (
    <>
      <TopBar
        title="Cash Flow Statement"
        subtitle="Opening - Operating / Investing / Financing - Net - Closing"
        usesPeriod={false}
      />
      <div className={styles.pageBody}>
        <CashFlowFilters
          companyId={companyId}
          periods={periods}
          years={years}
          current={{
            from: fromParam,
            to: toParam,
            periodId: periodIdParam,
            view: viewParam,
            scope: scopeKind,
            year: yearParam,
            q: qParam,
            half: halfParam,
            showZero: showZeroResolved,
            showZeroRaw: showZeroParam,
            matrix: matrixParam,
            matrixShowZero: showZeroParam === "1",
          }}
          meta={{
            scopeLabel: viewParam === "matrix" ? `Range: ${scopeLabel}` : scopeLabel,
            periodStatusLabel:
              viewParam !== "matrix" && inPeriodMode && periodStatus
                ? PERIOD_STATUS_LABEL[periodStatus]
                : null,
            dataQuality:
              viewParam !== "matrix"
                ? {
                    unclassified: coverage.unclassified,
                    fxPending: coverage.fxPending,
                    excluded: coverage.excluded,
                  }
                : null,
            zeroLinesShown: viewParam === "matrix" ? showZeroParam === "1" : showZeroResolved,
          }}
        />

        {!hasAnyPeriod && hasStructure && canManagePeriods && (
          <div className={styles.scopeRow}>
            <span className={styles.rangeHint}>
              No accounting periods yet. Create and manage periods in{" "}
              <Link href={`/c/${companyId}/dashboard`} className={styles.exclLink}>
                Period management
              </Link>
              .
            </span>
          </div>
        )}

        {!hasStructure ? (
          <div className={styles.notice}>
            No active cash flow structure for this company yet. Build the Section / Group / Class
            structure first, then generate the statement.
          </div>
        ) : viewParam === "matrix" ? (
          <div className={styles.statementCard}>
            <MatrixFullscreenShell
              title={
                matrixParam === "quarter"
                  ? "Matrix - by quarter"
                  : matrixParam === "month"
                    ? "Matrix - by month"
                    : "Matrix"
              }
              modeLabel={
                matrixParam === "quarter" ? "Quarter view" : matrixParam === "month" ? "Month view" : "Year view"
              }
            >
              {matrixParam === "year" ? (
                matrix ? <MatrixTable model={matrix} /> : <div className={styles.empty}>No matrix data.</div>
              ) : aggregateMatrix ? (
                <AggregateMatrixTable model={aggregateMatrix} mode={matrixParam} />
              ) : (
                <div className={styles.empty}>No matrix data.</div>
              )}
            </MatrixFullscreenShell>
          </div>
        ) : (
          <>
            {/* Cash-flow bridge: Opening -> section flows -> Net -> FX -> Closing.
                Shown above the detail table as the report summary. */}
            <div className={styles.bridgeCard}>
              <div className={styles.bridgeTitle}>Cash Flow Bridge</div>

              <div className={styles.totalLine}>
                <span>
                  Opening Cash Balance
                  {opening.value !== null && SOURCE_LABEL[opening.state] && (
                    <span className={styles.sourceNote} title={SOURCE_TITLE[opening.state]}>
                      {SOURCE_LABEL[opening.state]}
                    </span>
                  )}
                </span>
                <span className={styles.num} data-zero={opening.value === 0}>
                  {opening.value === null ? "-" : fmt(opening.value)}
                </span>
              </div>

              {opening.value === null && (
                <div className={styles.balancePlaceholder}>
                  Opening balance is not set for this period.
                  {opening.state === "carried-candidate" && opening.candidate !== null && (
                    <div className={styles.carriedNote}>
                      Carried opening available from the previous period:{" "}
                      <strong>{fmt(opening.candidate)}</strong>.
                    </div>
                  )}
                </div>
              )}

              {roots.map((s) => (
                <div key={s.id} className={`${styles.totalLine} ${styles.bridgeIndent}`}>
                  <span>{s.label}</span>
                  <span className={styles.num} data-zero={s.amount === 0}>{fmt(s.amount)}</span>
                </div>
              ))}

              <div className={`${styles.totalLine} ${styles.netLine}`}>
                <span>Net Cash Change</span>
                <span className={styles.num} data-zero={net === 0}>{fmt(net)}</span>
              </div>
              <div className={styles.totalLine}>
                <span>FX fluctuations</span>
                <span className={styles.num} data-zero={periodFx === 0}>{fmt(periodFx)}</span>
              </div>
              <div className={`${styles.totalLine} ${styles.netLine}`}>
                <span title="Opening + Net Cash Change + FX fluctuations">Closing Cash Balance</span>
                <span className={styles.num} data-zero={closing === 0}>
                  {closing === null ? "-" : fmt(closing)}
                </span>
              </div>
            </div>

            <div className={styles.statementCard}>
              <div className={styles.cardTitle}>Statement detail</div>
              <div className={styles.cardSubtitle}>Line-by-line cash flow for the selected scope.</div>
              {rows.length === 0 ? (
                <div className={styles.empty}>The active structure has no line items to show.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.colLabel}>Line</th>
                      <th className={styles.colTxns} title="Transactions included in this line.">Transactions</th>
                      <th className={styles.colAmount} title="Signed cash-flow amount in GEL.">Amount [GEL]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={`${r.kind}-${i}`}
                        className={
                          r.emphasis
                            ? styles.rowSection
                            : r.kind === "group"
                              ? styles.rowGroup
                              : styles.rowClass
                        }
                      >
                        <td style={{ paddingLeft: 8 + r.depth * 18 }}>
                          <span className={styles.labelCell}>
                            {r.label}
                            {r.kind === "class" && r.direction && (
                              <span className={styles.dirTag} data-dir={r.direction}>
                                {r.direction === "in"
                                  ? "in"
                                  : r.direction === "out"
                                    ? "out"
                                    : r.direction === "both"
                                      ? "in / out"
                                      : "no direction"}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={styles.colTxns}>[ {r.count} ]</td>
                        <td className={styles.colAmount} data-zero={r.amount === 0}>{r.amountText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
