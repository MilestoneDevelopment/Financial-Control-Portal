-- =============================================================================
-- Financial Control Portal - 0007 accounting uploads & transactions (Phase 2A)
-- Foundation for importing accounting Excel exports and storing normalized
-- transactions. Adds:
--   * accounting_files   - one row per uploaded file / import batch
--   * transactions       - normalized accounting rows (FX + classification stubs)
--   * accounting_file_issues - per-file validation / review items
--   * a private Storage bucket `accounting-files` + access policies
--
-- Security model is unchanged from Phase 1: RLS enabled on every new table;
-- reads scoped via auth_company_ids(); writes gated by the EXISTING capabilities
-- (upload.file / classification.review -- already seeded in 0001, no new caps).
-- `authenticated` gets only the base privileges it needs (RLS is the gate);
-- no grants to anon; no direct table DML to service_role. Compatible with the
-- period lifecycle: a row may reference a period, and the app enforces
-- requirePeriodMutable before writing (locked/closed need Correction Mode).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type import_status         as enum ('uploaded', 'parsing', 'parsed', 'imported', 'failed');
create type upload_validation_status as enum ('pending', 'passed', 'warnings', 'failed');
create type fx_status             as enum ('not_required', 'pending', 'resolved', 'manual');
create type tx_classification_status as enum ('unclassified', 'suggested', 'confirmed', 'rejected');
create type upload_issue_severity as enum ('error', 'warning', 'info');

-- ---------------------------------------------------------------------------
-- accounting_files: one uploaded file = one import batch (1:1 for the
-- foundation; a batch table can split out later if multi-file imports arrive).
-- ---------------------------------------------------------------------------
create table accounting_files (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies (id) on delete cascade,
  period_id              uuid references periods (id) on delete set null,  -- selected/known period
  uploaded_by            uuid references profiles (id) on delete set null default auth.uid(),
  storage_path           text not null,                 -- object path in the accounting-files bucket
  original_filename      text not null,
  file_size              bigint,                         -- bytes
  row_count              integer,                        -- null until parsed (Phase 2B)
  detected_period_start  date,                           -- inferred from file contents (Phase 2B)
  detected_period_end    date,
  selected_period_start  date,                           -- chosen by the uploader
  selected_period_end    date,
  import_status          import_status not null default 'uploaded',
  validation_status      upload_validation_status not null default 'pending',
  supersedes_file_id     uuid references accounting_files (id) on delete set null,
  is_superseded          boolean not null default false,
  is_correction_upload   boolean not null default false, -- uploaded against a locked/closed period in Correction Mode
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transactions: normalized rows extracted from an accounting file.
-- Amounts in numeric(18,2); FX rate in numeric(18,6) (GEL per 1 unit).
-- ---------------------------------------------------------------------------
create table transactions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies (id) on delete cascade,
  file_id               uuid not null references accounting_files (id) on delete cascade,
  period_id             uuid references periods (id) on delete set null,
  row_index             integer,                          -- position in the source file
  transaction_date      date,
  document_ref          text,
  reference             text,
  description           text,
  comment               text,
  debit_account         text,
  credit_account        text,
  debit_amount          numeric(18, 2),
  credit_amount         numeric(18, 2),
  original_amount       numeric(18, 2),
  original_currency     currency,                          -- GEL/USD/EUR; null = unknown
  fx_rate_to_gel        numeric(18, 6),
  fx_rate_source        fx_rate_source,
  fx_rate_date          date,
  fx_status             fx_status not null default 'pending',
  amount_gel            numeric(18, 2),                    -- base-currency normalized amount
  classification_status tx_classification_status not null default 'unclassified',
  class_id              uuid references cf_nodes (id) on delete set null,  -- nullable for now
  raw_row_json          jsonb not null default '{}'::jsonb, -- verbatim source row for traceability
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounting_file_issues: validation errors / review items per file (and row).
-- ---------------------------------------------------------------------------
create table accounting_file_issues (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references accounting_files (id) on delete cascade,
  company_id  uuid not null references companies (id) on delete cascade,
  row_index   integer,                                   -- null = file-level issue
  severity    upload_issue_severity not null default 'error',
  code        text not null,                             -- machine code, e.g. PERIOD_MISMATCH
  message     text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (volume access paths: per company/period/file, by date & class)
-- ---------------------------------------------------------------------------
create index idx_acc_files_company   on accounting_files (company_id, created_at desc);
create index idx_acc_files_period    on accounting_files (period_id);
create index idx_tx_company_period   on transactions (company_id, period_id);
create index idx_tx_file             on transactions (file_id);
create index idx_tx_company_date     on transactions (company_id, transaction_date);
create index idx_tx_classification   on transactions (company_id, classification_status);
create index idx_tx_class            on transactions (class_id);
create index idx_acc_issues_file     on accounting_file_issues (file_id);

-- ---------------------------------------------------------------------------
-- RLS (mirrors Phase 1: select via company access; writes via capabilities)
-- ---------------------------------------------------------------------------
alter table accounting_files       enable row level security;
alter table transactions           enable row level security;
alter table accounting_file_issues enable row level security;

-- accounting_files
create policy acc_files_select on accounting_files for select to authenticated
  using (company_id in (select auth_company_ids()));
create policy acc_files_insert on accounting_files for insert to authenticated
  with check (auth_can('upload.file', company_id));
create policy acc_files_update on accounting_files for update to authenticated
  using (auth_can('upload.file', company_id))
  with check (auth_can('upload.file', company_id));

-- transactions (import inserts gated by upload.file; updates/classification land in 2B)
create policy tx_select on transactions for select to authenticated
  using (company_id in (select auth_company_ids()));
create policy tx_insert on transactions for insert to authenticated
  with check (auth_can('upload.file', company_id));

-- accounting_file_issues (written by the importer; readable with company access)
create policy acc_issues_select on accounting_file_issues for select to authenticated
  using (company_id in (select auth_company_ids()));
create policy acc_issues_insert on accounting_file_issues for insert to authenticated
  with check (auth_can('upload.file', company_id));

-- ---------------------------------------------------------------------------
-- API base-table grants for `authenticated` (RLS is the row-level gate).
-- Foundation writes only INSERT (+ UPDATE on files for status). No anon, no
-- service_role DML, no DELETE yet (file removal/replace arrives with upload.remove).
-- ---------------------------------------------------------------------------
grant select, insert, update on public.accounting_files       to authenticated;
grant select, insert         on public.transactions           to authenticated;
grant select, insert         on public.accounting_file_issues to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for uploaded accounting files. Path convention:
--   {company_id}/{file_uuid}/{original_filename}
-- Access is scoped to companies the user can access; uploads additionally
-- require the upload.file capability. Never public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('accounting-files', 'accounting-files', false)
on conflict (id) do nothing;

create policy "accounting_files_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'accounting-files'
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
  );

create policy "accounting_files_upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'accounting-files'
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
    and auth_can('upload.file', (storage.foldername(name))[1]::uuid)
  );
