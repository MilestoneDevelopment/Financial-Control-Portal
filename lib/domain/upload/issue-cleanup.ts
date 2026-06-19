/**
 * Pure helpers for Phase 2D polish (no DB imports - testable).
 *  - active issue filtering/count (resolved issues are kept as history)
 *  - which MISSING_FX issues to mark resolved after an FX-resolution pass
 *  - whether to revert an old file's is_superseded flag after a remove
 */

export interface IssueLike {
  id: string;
  code: string;
  row_index: number | null;
  resolved_at: string | null;
}

/** Active = not yet resolved. */
export function activeIssues<T extends { resolved_at: string | null }>(issues: T[]): T[] {
  return issues.filter((i) => i.resolved_at === null);
}

export function activeIssueCount(issues: { resolved_at: string | null }[]): number {
  return issues.reduce((n, i) => (i.resolved_at === null ? n + 1 : n), 0);
}

/**
 * Ids of MISSING_FX issues to mark resolved after an FX-resolution pass.
 * Clears an unresolved MISSING_FX issue when its row was resolved this pass, or -
 * when no FX rows remain pending for the file - any leftover MISSING_FX issues
 * (including file-level, row_index null, ones from earlier resolve runs).
 * Never touches non-MISSING_FX issues (e.g. BAD_CURRENCY stays active) or
 * already-resolved issues.
 */
export function missingFxIssuesToClear(
  issues: IssueLike[],
  resolvedRowIndexes: number[],
  noPendingRemain: boolean,
): string[] {
  const resolvedSet = new Set(resolvedRowIndexes);
  return issues
    .filter((i) => i.resolved_at === null && i.code === "MISSING_FX")
    .filter((i) => noPendingRemain || (i.row_index !== null && resolvedSet.has(i.row_index)))
    .map((i) => i.id);
}

/** Revert the old file's is_superseded flag only when no replacement remains. */
export function shouldRevertSupersede(remainingReplacementCount: number): boolean {
  return remainingReplacementCount === 0;
}
