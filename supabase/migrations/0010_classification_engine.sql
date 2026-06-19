-- =============================================================================
-- Financial Control Portal - 0010 classification engine foundation (Phase 3A)
-- Adds classification_rules + transaction classification metadata so normalized,
-- FX-resolved transactions can be classified into active cf_nodes class nodes by
-- a deterministic rule engine (no AI). Reuses tx_classification_status
-- (confirmed = classified, suggested = needs_review, unclassified = none).
-- Security posture preserved: RLS on the new table, company-scoped, capability-
-- gated; no anon grants; no service_role DML.
-- =============================================================================

create type classification_source as enum ('manual', 'rule');
create type classification_rule_type as enum (
  'account_exact', 'account_pair', 'description_contains', 'description_regex',
  'amount_direction', 'combined'
);

create table classification_rules (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations (id) on delete cascade,
  company_id             uuid not null references companies (id) on delete cascade,
  class_id               uuid not null references cf_nodes (id) on delete cascade,
  name                   text not null,
  priority               integer not null default 100,   -- lower = evaluated first
  is_active              boolean not null default true,
  rule_type              classification_rule_type not null,
  debit_account_pattern  text,
  credit_account_pattern text,
  description_pattern    text,
  currency               currency,
  min_amount             numeric(18, 2),
  max_amount             numeric(18, 2),
  cash_direction         cash_direction,
  confidence_score       numeric(5, 4) not null default 0.9,
  created_by             uuid references profiles (id) on delete set null default auth.uid(),
  updated_by             uuid references profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Transaction classification metadata (class_id + classification_status already exist).
alter table transactions
  add column classification_source     classification_source,
  add column classification_confidence numeric(5, 4),
  add column classified_at             timestamptz,
  add column classified_by             uuid references profiles (id) on delete set null,
  add column matched_rule_id           uuid references classification_rules (id) on delete set null;

create index idx_class_rules_company on classification_rules (company_id, is_active, priority);
create index idx_class_rules_class   on classification_rules (class_id);
create index idx_tx_matched_rule     on transactions (matched_rule_id);

-- RLS: company-scoped reads; rule writes gated by classification.manage_rules.
alter table classification_rules enable row level security;
create policy class_rules_select on classification_rules for select to authenticated
  using (company_id in (select auth_company_ids()));
create policy class_rules_write on classification_rules for all to authenticated
  using (auth_can('classification.manage_rules', company_id))
  with check (auth_can('classification.manage_rules', company_id));

grant select, insert, update, delete on public.classification_rules to authenticated;

-- Broaden transaction UPDATE to also allow classification.assign holders (FX
-- resolution still works via upload.file). RLS remains the row-level gate.
drop policy tx_update on transactions;
create policy tx_update on transactions for update to authenticated
  using (auth_can('upload.file', company_id) or auth_can('classification.assign', company_id))
  with check (auth_can('upload.file', company_id) or auth_can('classification.assign', company_id));

-- New capabilities. Owner (level 5) holds them via the auth_can level fallback;
-- new orgs get explicit role_permissions through seed_org_defaults.
insert into capabilities (capability_key, group_label, label, min_level) values
  ('classification.run',          'Upload & Classification', 'Run classification engine', 2),
  ('classification.assign',       'Upload & Classification', 'Assign transaction classification', 2),
  ('classification.manage_rules', 'Upload & Classification', 'Manage classification rules', 3)
on conflict (capability_key) do nothing;
