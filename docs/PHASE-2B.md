# Phase 2B - Server-side XLSX parsing & transaction import

Branch: `phase-2b-xlsx-parser-transactions` (off `phase-2a-...`). Scope: parse an
uploaded accounting `.xlsx` from private Storage and import its rows into
`transactions`. **No** classification engine, cash-flow generation, reports/export,
or forecast/budget. **No schema migration** - the Phase 2A `0007` schema already
supports import (existing grants cover INSERT into transactions/issues + UPDATE on
accounting_files).

## Implemented

- **Parser dependency:** `exceljs` (maintained, pure-JS, no native deps), marked
  `serverExternalPackages` in `next.config.mjs`. Used only server-side.
- **Server-only adapter** (`lib/server/xlsx.ts`, `import "server-only"`): loads the
  workbook buffer, coerces rich cells to primitives, auto-detects the header row
  (best header match in the first 10 rows), returns a dense `{ headers, rows }`
  grid. Raw cell values never reach the client.
- **Pure import core** (`lib/domain/upload/import.ts`, tested): maps headers via the
  Phase 2A column contract, validates required columns, normalizes each row, raises
  per-row / file-level issues, computes detected period range and validation status.
  Never invents values - missing/ambiguous fields produce an issue + preserved
  `raw_row_json`.
- **Parsing helpers** (`lib/domain/upload/parse.ts`): added `parseAccountingDate`
  (ISO, dd/mm & dd.mm European/Georgian, JS Date, Excel serial) and `parseCurrency`
  (GEL/USD/EUR incl. symbols). Column contract extended with FX rate / FX rate date.
- **Import action** (`parseAccountingFileAction`): capability-gated (`upload.file`),
  period-aware (`requirePeriodMutable` when bound to a period), downloads from
  Storage, parses, writes `accounting_file_issues`, inserts `transactions` in a
  single atomic insert, updates `accounting_files` (row_count, detected period,
  import/validation status), and audits `accounting.file.imported` /
  `accounting.file.parse_failed`. Idempotency: a file already `imported` cannot be
  re-imported (no DELETE grant → prevents duplicate rows); `failed`/`uploaded` are
  re-parseable.
- **UI** (`/c/[companyId]/upload`): per-file **Parse / Retry** action, live import &
  validation status, row count, detected period, and an expandable per-file issues
  list (code · row · message).

## Transaction mapping

Populated per row when safely derivable: transaction_date, document/reference/
description/comment, debit/credit account + amounts, original amount/currency,
fx_rate_to_gel + fx_rate_source(`imported`) + fx_rate_date (if present), fx_status,
amount_gel, classification_status=`unclassified`, class_id=null, raw_row_json.

## FX handling (Phase 2B only)

- GEL (base) rows → `fx_status = not_required`, `amount_gel = original_amount`.
- USD/EUR with an in-file rate → `resolved`, `fx_rate_source = imported`,
  `amount_gel = original_amount × rate`.
- USD/EUR without a rate → `pending` + `MISSING_FX` issue, `amount_gel` left null.
- Unknown currency → `pending` + `BAD_CURRENCY` issue. No NBG API call (Phase 2C).

## Validation issues

`MISSING_COLUMN` (blocks import), `BAD_DATE`, `BAD_AMOUNT`, `BAD_CURRENCY`,
`MISSING_FX`, `PERIOD_MISMATCH`, `NO_DATA_ROWS`. Errors → validation `failed`;
warnings only → `warnings`; none → `passed`.

## Known limitations

- `.xls` (legacy binary) not supported - re-save as `.xlsx` (a clear error is shown).
- No NBG FX resolution yet (only in-file rates) - Phase 2C.
- No file remove/replace/supersede yet (needs `upload.remove` + storage delete
  policy + DELETE grant).
- Re-parse of a `failed` file may duplicate advisory issue rows (transactions never
  duplicate - atomic insert + the `imported` guard). A clean re-import would need a
  DELETE grant (deferred).
- amount_gel is only set for base-currency or in-file-rate rows; debit/credit
  semantics for the cash-flow engine are Phase 3.

## Recommended next phase (2C / 3)

1. NBG FX rate resolution (fill `fx_rates`, resolve pending rows → `amount_gel`).
2. File remove/replace/supersede with `upload.remove` (storage delete policy + grant).
3. Phase 3: classification engine consuming these normalized transactions.
