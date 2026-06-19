# Phase 2D - Upload/import polish cleanup

Branch: `phase-2d-upload-polish-cleanup` (off `phase-2c-...`). Scope: resolve the
two non-blocking state/UX consistency issues found in 2C. No classification,
cash-flow, reports, or forecast.

## Implemented

- **Migration 0009** (`issue_resolution_markers`): adds `resolved_at`,
  `resolved_by`, `resolution_note` to `accounting_file_issues`, plus an UPDATE
  policy (gated `upload.file`) + grant so the FX resolver can mark issues resolved.
  No new tables. `db/types.ts` updated.
- **FX issue cleanup**: when `Resolve FX` resolves a transaction that previously
  raised `MISSING_FX`, the matching issue is **marked resolved** (not deleted) -
  `resolved_at`/`resolved_by`/`resolution_note = "Cleared by FX resolution."`.
  History is preserved. `BAD_CURRENCY` and already-resolved issues are untouched.
- **Superseded-flag cleanup**: removing a file that supersedes another now reverts
  the old file's `is_superseded` to `false` **when no other replacement remains**.
  The old file's transactions and Storage object are preserved.
- **UI**: the Issues column shows the **active** (unresolved) count, with `(+N)`
  for resolved history; expanding shows active issues normally and resolved ones
  muted/struck-through with a `resolved` tag. The `superseded` badge now clears
  automatically once the DB flag is reverted.
- **Pure helpers** (`lib/domain/upload/issue-cleanup.ts`, tested): `activeIssues`,
  `activeIssueCount`, `missingFxIssuesToClear` (the resolve-time decision), and
  `shouldRevertSupersede`.

## FX issue cleanup behavior

After a resolve pass: `missingFxIssuesToClear(openIssues, resolvedRowIndexes,
noPendingRemain)` selects unresolved `MISSING_FX` issues whose row resolved this
pass; when **no** FX rows remain pending it also clears leftover file-level
(`row_index null`) `MISSING_FX` issues from earlier runs. Those ids are stamped
resolved. The `accounting.fx.resolved` audit now includes `issuesCleared`.

## Superseded flag cleanup behavior

In `removeAccountingFileAction`, after deleting the target row (+ cascade +
storage), if the removed file had a `supersedes_file_id` and no remaining file
still references it, the old file's `is_superseded` is set back to `false`. The
`accounting.file.removed` audit includes `supersedeReverted`.

## Tests / typecheck / build

`npm test` 54/54 · `npm run typecheck` clean · `npm run build` success (15 routes).

## Supabase / security verification

New columns present; `acc_issues_update` policy added; `authenticated` gained
UPDATE on `accounting_file_issues` (RLS-gated). RLS enabled on all tables;
bucket private; **no anon grants; no service_role DML**. Security advisor
unchanged from the 2C baseline (no new warnings).

## Known limitations

- Cleanup applies to **new** actions only; pre-existing data (e.g. the 2C
  smoke-test file's `MISSING_FX` issue, and the success-test file's
  `is_superseded`) is not retroactively cleaned until its file is re-resolved /
  re-removed. A fresh 2D smoke test confirms behavior going forward.
- Resolved issues are retained as history (by design); there is no purge.

## Phase 3 readiness

Phase 2 (upload → parse → FX resolve → file lifecycle, with clean issue/supersede
state) is complete and verified. **Phase 3 (classification engine) can start** on
a fresh branch over these normalized, FX-resolved transactions.
