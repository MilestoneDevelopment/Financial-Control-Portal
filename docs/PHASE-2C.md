# Phase 2C - FX resolution & file lifecycle

Branch: `phase-2c-fx-resolution-file-lifecycle` (off `phase-2b-...`). Scope: resolve
missing FX onto imported transactions, and add the upload file lifecycle
(remove / replace / supersede). **No** classification, cash-flow, reports, or
forecast.

## Implemented

- **Migration 0008** (`fx_resolution_file_lifecycle`): adds an UPDATE policy +
  grant on `transactions` (FX writes, gated `upload.file`), a DELETE policy + grant
  on `accounting_files` (gated `upload.remove`, cascades children), a private
  `storage.objects` DELETE policy for `accounting-files` (company access +
  `upload.remove`), and a hardened `cache_fx_rate` SECURITY DEFINER function. No
  new tables. `db/types.ts` updated.
- **FX resolution** - pure decision logic (`lib/domain/upload/fx-resolve.ts`) +
  NBG response parser (`lib/domain/upload/nbg.ts`), both tested; server-only NBG
  fetch (`lib/server/nbg.ts`, uses `NBG_FX_ENDPOINT`, best-effort, never client);
  `resolveFxForFileAction` orchestrates the priority chain and persists results.
- **File lifecycle actions** (`upload/actions.ts`): `removeAccountingFileAction`,
  `replaceAccountingFileAction` (supersede), capability- and period-gated, audited.
- **UI** (`/c/[companyId]/upload`): per-file **Resolve FX** (when imported with
  pending FX), **Replace** (inline file picker), **Remove** (confirm), an FX
  summary column (`N ok · M pending`), and a `superseded` badge.

## FX resolution behavior

Priority per foreign-currency transaction (date D, currency C):
1. **Imported in-file rate** - already `resolved` at import (2B); never overwritten.
2. **`fx_rates` exact date** - existing cached/seeded rate for (C, D).
3. **NBG exact** - fetch `NBG_FX_ENDPOINT?date=D`; cache via `cache_fx_rate`
   (`source = nbg`). Per-unit rate = `rate / quantity`.
4. **Prior date** - NBG returning an earlier effective date, or the latest
   `fx_rates` row before D → `source = nbg_prior_filled`.
5. **Unresolved** → stays `pending` + `MISSING_FX` issue.

GEL (base) → `not_required`, `amount_gel = original_amount`. Resolved →
`amount_gel = original_amount × rate`. **No rate is ever invented**; NBG is called
server-side only and failures degrade gracefully to prior/pending.

`cache_fx_rate` is SECURITY DEFINER (owner postgres, EXECUTE to `authenticated`
only) so the national `fx_rates` table needs no direct INSERT grant; it accepts
only `nbg`/`nbg_prior_filled` sources and never overwrites existing rows.

## File lifecycle behavior

- **Remove** (`upload.remove`): deletes the `accounting_files` row (cascades
  transactions + issues) then best-effort deletes the Storage object; audited.
  Blocked when bound to a locked/closed period without Correction Mode.
- **Replace / Supersede** (`upload.replace`): uploads a new file that inherits the
  old file's period, sets `supersedes_file_id`, and flags the old row
  `is_superseded` (kept + old object preserved for traceability). The new file
  starts `uploaded` and must be parsed to import. Audited.
- All actions are RLS + capability gated; storage stays private.

## Supabase / security verification

RLS enabled on all tables; new policies present (tx_update, acc_files_delete,
storage accounting_files_delete). `authenticated` gained UPDATE on transactions +
DELETE on accounting_files (RLS-gated). `service_role` table DML still NONE; bucket
still private; `cache_fx_rate` EXECUTE = authenticated/postgres only (no anon).
Security advisor: one new **expected** WARN (`cache_fx_rate` executable by
signed-in users - intentional, same class as the `auth_*` helpers); no ERROR/
critical, no new anon exposure.

## Known limitations

- NBG resolution is online/best-effort; offline → falls back to `fx_rates` prior
  or stays `pending`. NBG response shape assumed per the current public API.
- Resolve FX re-runs may write duplicate advisory `MISSING_FX` issue rows
  (transactions are updated idempotently; only unresolved rows re-issue).
- Replace does not auto-parse the new file (intentional: review → Parse).
- Remove cascade is permanent; no soft-delete/restore (supersede preserves
  history instead).
- The current sample data has no pending-FX rows (the 2B USD row resolved via its
  in-file rate), so resolve-FX needs a workbook with a rate-less USD/EUR row to
  exercise end-to-end.

## Recommended next phase

- **Phase 3: classification engine** consuming these normalized, FX-resolved
  transactions (rule-based, Georgian-aware), writing `class_id` /
  `classification_status`.
- Optional 2D polish: manual FX override (`fx_status = manual`), scheduled NBG
  backfill into `fx_rates`, soft-delete/restore for files.
