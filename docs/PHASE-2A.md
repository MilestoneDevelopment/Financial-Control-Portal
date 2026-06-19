# Phase 2A - Accounting upload & transactions foundation

Branch: `phase-2a-accounting-upload-foundation`. Scope: the storage + schema + UI
foundation for importing accounting Excel exports. **No** full cash-flow engine,
reports/export, forecast/budget, or fuzzy classification - those are later phases.
XLSX parsing into transactions is intentionally deferred to Phase 2B.

## Implemented

- **Migration 0007** (`accounting_uploads_transactions`): three tables +
  enums + indexes + RLS + storage bucket/policies (see below). Applied + verified
  on `financial-control-portal`. `db/types.ts` regenerated.
- **Schema**
  - `accounting_files` - one uploaded file = one import batch (1:1 for now).
    Tracks storage path, original filename, size, selected/detected period range,
    `import_status`, `validation_status`, supersede chain, correction flag.
  - `transactions` - normalized rows: dates, document/reference/description/
    comment, debit/credit accounts + amounts, original amount/currency, FX fields
    (`fx_rate_to_gel`, `fx_rate_source`, `fx_rate_date`, `fx_status`), `amount_gel`,
    `classification_status`, nullable `class_id`, and `raw_row_json` for traceability.
  - `accounting_file_issues` - per-file / per-row validation & review items.
- **Security** (unchanged posture): RLS enabled on all three tables; reads scoped
  via `auth_company_ids()`; writes gated by the EXISTING `upload.file` capability
  (seeded in 0001 - no new capabilities). `authenticated` granted only
  SELECT/INSERT (+ UPDATE on `accounting_files`); no `anon` grants; no
  `service_role` DML; no DELETE yet (file removal lands with `upload.remove`).
- **Storage**: private bucket `accounting-files` (never public). Path convention
  `{company_id}/{file_uuid}/{original_filename}`. Two `storage.objects` policies -
  read requires company access; upload additionally requires `upload.file` - both
  parse the company id from the first path segment.
- **Upload UI** (`/c/[companyId]/upload`): period selector (locked/closed periods
  disabled unless Correction Mode), Excel file picker, upload to Storage + create
  `accounting_files` record, status notice, and an uploaded-files table
  (filename, size, import status, validation status, rows, uploaded time).
- **Server action** (`uploadAccountingFileAction`): capability-gated (`upload.file`),
  validates file metadata (extension/size), enforces `requirePeriodMutable` when a
  period is selected, stores the file, inserts the record (rolls back the stored
  object if the insert fails), and audits `accounting.file.uploaded`
  (actor captured automatically via migration 0006).
- **Domain logic + tests** (`lib/domain/upload/*`, pure/testable):
  - `status.ts` - import-status transitions, in-progress check, validation-status
    derivation from issues.
  - `parse.ts` - `parseAccountingNumber` (parentheses-negative, thousands, symbols),
    `classifyFxStatus`, `dateWithinSelected`, `detectPeriodMismatch`,
    `validateUploadFile`, `hasBlockingIssue`.
  - `columns.ts` - the expected Excel column contract (`EXPECTED_COLUMNS`,
    EN + Georgian header aliases) and the `TransactionDraft` shape the Phase 2B
    parser will emit. Header matching via `matchHeader`.

## Parser / import architecture (decided; implementation is Phase 2B)

- Parsing will run in a **server action / server-only module** (never client):
  the uploaded object is fetched from Storage server-side, parsed into
  `TransactionDraft[]` against `EXPECTED_COLUMNS`, normalized (numbers via
  `parseAccountingNumber`, FX via `classifyFxStatus`), and inserted into
  `transactions` under the existing RLS. File contents are never exposed to the
  client beyond safe metadata.
- No XLSX parsing dependency is added in this batch (keeps the foundation lean and
  avoids shipping a binary parser before it's needed). Phase 2B adds a server-side
  parser (e.g. a vetted `xlsx`/`exceljs` equivalent) behind `lib/domain/upload`.
- Import status flow: `uploaded → parsing → parsed → imported` (with `failed`
  reachable + retry), tracked on `accounting_files.import_status`.

## Storage bucket / policy status

Done in 0007: private bucket created; read + upload policies on `storage.objects`
scoped to accessible companies (upload also requires `upload.file`). No public
access. Remaining for 2B: a delete/remove policy paired with the `upload.remove`
capability when file removal/replacement is built.

## Known limitations (foundation)

- No XLSX parsing yet → `row_count`, `detected_period_*`, and `transactions` rows
  are not populated by upload alone (Phase 2B).
- No file remove/replace/supersede actions yet (schema supports them; needs
  `upload.remove`/`upload.replace` wiring + a storage delete policy + DELETE grant).
- No classification UI/engine (transactions land `unclassified`, `class_id` null).
- One file = one batch; multi-file batches can split `accounting_files` later.

## Recommended Phase 2B scope

1. Server-side XLSX parser → `TransactionDraft[]` against `EXPECTED_COLUMNS`;
   populate `transactions`, `row_count`, detected period range; write
   `accounting_file_issues`; advance `import_status`/`validation_status`.
2. Period-mismatch + validation surfacing in the UI (per-file issues view).
3. File remove/replace/supersede (+ `upload.remove` storage delete policy & grant).
4. FX resolution (rate lookup → `amount_gel`, `fx_status = resolved`).
5. Then Phase 3: classification engine consuming these normalized transactions.
