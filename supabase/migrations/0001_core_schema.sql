-- =============================================================================
-- Financial Control Portal - Phase 0 core schema
-- Identity & access, companies (configurable base currency), versioned cash-flow
-- structure scaffold, periods (lifecycle + opening balance), FX rates, audit log.
-- RLS is enabled on every table; access is resolved via capability helpers.
-- Operational tables (transactions, classification, forecast, cash flow entries,
-- reports, accounting files) arrive in later phases.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type currency as enum ('GEL', 'USD', 'EUR');
create type company_status as enum ('draft', 'active', 'archived');
create type period_status as enum ('draft', 'active', 'locked', 'closed', 'archived');
create type opening_balance_source as enum ('carried', 'imported', 'manual');
create type fx_rate_source as enum ('imported', 'nbg', 'nbg_prior_filled', 'manual');
create type invitation_status as enum ('pending', 'accepted', 'expired', 'cancelled');
create type audit_severity as enum ('ok', 'warn');
create type structure_version_status as enum ('draft', 'active', 'superseded');

-- ---------------------------------------------------------------------------
-- Identity & access
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  avatar_url    text,
  appearance    jsonb not null default '{}'::jsonb,
  notif_prefs   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  key         text not null,                 -- 'owner' | 'admin' | 'cfo' | 'editor' | 'viewer' | custom slug
  name        text not null,
  description text,
  is_system   boolean not null default false,
  level       integer not null default 0,    -- 5..1 for system roles, 0 for custom (override-driven)
  created_at  timestamptz not null default now(),
  unique (org_id, key)
);

-- Global capability reference (seeded below). Mirrors lib/permissions/capabilities.ts.
create table capabilities (
  capability_key text primary key,
  group_label    text not null,
  label          text not null,
  min_level      integer not null
);

create table role_permissions (
  role_id        uuid not null references roles (id) on delete cascade,
  capability_key text not null references capabilities (capability_key) on delete cascade,
  allowed        boolean not null,
  primary key (role_id, capability_key)
);

create table companies (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  name             text not null,
  short_code       text,
  base_currency    currency not null default 'GEL',   -- configurable; never hardcoded to USD
  status           company_status not null default 'draft',
  structure_source text,
  in_portfolio     boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (org_id, short_code)
);

-- Membership = per-company role. company_id NULL means an org-level membership
-- (e.g. Owner/Admin) that applies across every company in the org.
create table memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  company_id  uuid references companies (id) on delete cascade,
  role_id     uuid not null references roles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (user_id, company_id)
);

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  email       text not null,
  role_id     uuid not null references roles (id) on delete restrict,
  company_id  uuid references companies (id) on delete cascade,
  invited_by  uuid references profiles (id) on delete set null,
  status      invitation_status not null default 'pending',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create table security_settings (
  org_id              uuid primary key references organizations (id) on delete cascade,
  invite_expiry_days  integer not null default 7,
  default_role_key    text not null default 'viewer',
  settings            jsonb not null default '{}'::jsonb,  -- the 8 toggles
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Versioned cash-flow structure (scaffold; cf_nodes + builder land in Phase 1)
-- ---------------------------------------------------------------------------
create table cf_structure_versions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies (id) on delete cascade,
  version_no  integer not null,
  label       text,
  status      structure_version_status not null default 'draft',
  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (company_id, version_no)
);

-- ---------------------------------------------------------------------------
-- Periods (lifecycle + opening balance chain)
-- ---------------------------------------------------------------------------
create table periods (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references companies (id) on delete cascade,
  year                    integer not null,
  month                   integer,                -- 1..12; null for quarter/year scopes
  status                  period_status not null default 'draft',
  structure_version_id    uuid references cf_structure_versions (id) on delete set null,
  opening_balance         numeric(18, 2),
  opening_balance_source  opening_balance_source,
  opening_balance_set_by  uuid references profiles (id) on delete set null,
  opening_balance_set_at  timestamptz,
  closing_balance         numeric(18, 2),
  is_correction_mode      boolean not null default false,
  correction_reason       text,
  locked_by               uuid references profiles (id) on delete set null,
  locked_at               timestamptz,
  closed_by               uuid references profiles (id) on delete set null,
  closed_at               timestamptz,
  created_at              timestamptz not null default now(),
  unique (company_id, year, month)
);

-- ---------------------------------------------------------------------------
-- FX rates (national; GEL-quoted). rate = GEL per 1 unit of quote_currency.
-- ---------------------------------------------------------------------------
create table fx_rates (
  id              uuid primary key default gen_random_uuid(),
  quote_currency  currency not null,
  rate_date       date not null,
  rate            numeric(18, 6) not null,
  source          fx_rate_source not null,
  created_at      timestamptz not null default now(),
  unique (quote_currency, rate_date, source)
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references organizations (id) on delete cascade,
  company_id  uuid references companies (id) on delete set null,
  actor       uuid references profiles (id) on delete set null,
  action      text not null,
  target      text,
  details     jsonb not null default '{}'::jsonb,
  severity    audit_severity not null default 'ok',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (built for thousands-tens of thousands tx/company/month later;
-- foundation indexes here cover the access paths that exist in Phase 0).
-- ---------------------------------------------------------------------------
create index idx_companies_org on companies (org_id);
create index idx_roles_org on roles (org_id);
create index idx_memberships_user on memberships (user_id);
create index idx_memberships_org on memberships (org_id);
create index idx_memberships_company on memberships (company_id);
create index idx_invitations_org on invitations (org_id);
create index idx_invitations_email on invitations (email);
create index idx_cfsv_company on cf_structure_versions (company_id);
create index idx_periods_company on periods (company_id);
create index idx_periods_status on periods (status);
create index idx_fx_rates_lookup on fx_rates (quote_currency, rate_date);
create index idx_audit_org on audit_log (org_id, created_at desc);
create index idx_audit_company on audit_log (company_id, created_at desc);

-- =============================================================================
-- RLS helper functions (SECURITY DEFINER: run with owner privileges so they
-- can resolve membership without tripping RLS / recursion).
-- =============================================================================

create or replace function auth_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct org_id from memberships where user_id = auth.uid();
$$;

create or replace function auth_company_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  -- direct company memberships
  select company_id from memberships
    where user_id = auth.uid() and company_id is not null
  union
  -- org-level memberships grant every company in that org
  select c.id from companies c
    where c.org_id in (
      select org_id from memberships
      where user_id = auth.uid() and company_id is null
    );
$$;

-- Highest role (id + level) applicable to a given company for the current user.
create or replace function auth_role_for_company(p_company uuid)
returns table (role_id uuid, level integer)
language sql stable security definer set search_path = public
as $$
  select r.id, r.level
  from memberships m
  join roles r on r.id = m.role_id
  join companies c on c.id = p_company
  where m.user_id = auth.uid()
    and (m.company_id = p_company or (m.company_id is null and m.org_id = c.org_id))
  order by r.level desc
  limit 1;
$$;

create or replace function auth_role_for_org(p_org uuid)
returns table (role_id uuid, level integer)
language sql stable security definer set search_path = public
as $$
  select r.id, r.level
  from memberships m
  join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.org_id = p_org
  order by r.level desc
  limit 1;
$$;

create or replace function auth_can(cap text, p_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with rl as (select * from auth_role_for_company(p_company))
  select coalesce(
    (select rp.allowed from role_permissions rp, rl
       where rp.role_id = rl.role_id and rp.capability_key = cap),
    (select (rl.level >= cp.min_level) from rl, capabilities cp
       where cp.capability_key = cap),
    false
  );
$$;

create or replace function auth_can_org(cap text, p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with rl as (select * from auth_role_for_org(p_org))
  select coalesce(
    (select rp.allowed from role_permissions rp, rl
       where rp.role_id = rl.role_id and rp.capability_key = cap),
    (select (rl.level >= cp.min_level) from rl, capabilities cp
       where cp.capability_key = cap),
    false
  );
$$;

-- =============================================================================
-- Enable RLS + policies
-- =============================================================================
alter table organizations       enable row level security;
alter table profiles            enable row level security;
alter table roles               enable row level security;
alter table capabilities        enable row level security;
alter table role_permissions    enable row level security;
alter table companies           enable row level security;
alter table memberships         enable row level security;
alter table invitations         enable row level security;
alter table security_settings   enable row level security;
alter table cf_structure_versions enable row level security;
alter table periods             enable row level security;
alter table fx_rates            enable row level security;
alter table audit_log           enable row level security;

-- organizations
create policy org_select on organizations for select to authenticated
  using (id in (select auth_org_ids()));

-- profiles: own row
create policy profile_select_own on profiles for select to authenticated
  using (id = auth.uid());
create policy profile_insert_own on profiles for insert to authenticated
  with check (id = auth.uid());
create policy profile_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- capabilities: global read-only reference
create policy capabilities_select on capabilities for select to authenticated
  using (true);

-- roles
create policy roles_select on roles for select to authenticated
  using (org_id in (select auth_org_ids()));
create policy roles_write on roles for all to authenticated
  using (auth_can_org('roles.manage', org_id))
  with check (auth_can_org('roles.manage', org_id));

-- role_permissions (via parent role's org)
create policy role_perms_select on role_permissions for select to authenticated
  using (exists (select 1 from roles r where r.id = role_id and r.org_id in (select auth_org_ids())));
create policy role_perms_write on role_permissions for all to authenticated
  using (exists (select 1 from roles r where r.id = role_id and auth_can_org('roles.manage', r.org_id)))
  with check (exists (select 1 from roles r where r.id = role_id and auth_can_org('roles.manage', r.org_id)));

-- companies
create policy companies_select on companies for select to authenticated
  using (id in (select auth_company_ids()));
create policy companies_insert on companies for insert to authenticated
  with check (auth_can_org('companies.add', org_id));
create policy companies_update on companies for update to authenticated
  using (auth_can_org('companies.manage', org_id))
  with check (auth_can_org('companies.manage', org_id));

-- memberships
create policy memberships_select on memberships for select to authenticated
  using (user_id = auth.uid() or auth_can_org('users.manage', org_id));
create policy memberships_write on memberships for all to authenticated
  using (auth_can_org('users.manage', org_id))
  with check (auth_can_org('users.manage', org_id));

-- invitations
create policy invitations_select on invitations for select to authenticated
  using (auth_can_org('users.manage', org_id));
create policy invitations_write on invitations for all to authenticated
  using (auth_can_org('users.manage', org_id))
  with check (auth_can_org('users.manage', org_id));

-- security_settings
create policy security_select on security_settings for select to authenticated
  using (org_id in (select auth_org_ids()));
create policy security_write on security_settings for all to authenticated
  using (auth_can_org('users.manage', org_id))
  with check (auth_can_org('users.manage', org_id));

-- cf_structure_versions
create policy cfsv_select on cf_structure_versions for select to authenticated
  using (company_id in (select auth_company_ids()));
create policy cfsv_write on cf_structure_versions for all to authenticated
  using (auth_can('structure.edit', company_id))
  with check (auth_can('structure.edit', company_id));

-- periods
create policy periods_select on periods for select to authenticated
  using (company_id in (select auth_company_ids()));
create policy periods_write on periods for all to authenticated
  using (auth_can('period.approve_lock', company_id))
  with check (auth_can('period.approve_lock', company_id));

-- fx_rates: national reference, readable by all authenticated; writes via service role
create policy fx_select on fx_rates for select to authenticated using (true);

-- audit_log: append-only; visible to audit.view holders; no update/delete policies
create policy audit_select on audit_log for select to authenticated
  using (auth_can_org('audit.view', org_id));
create policy audit_insert on audit_log for insert to authenticated
  with check (org_id in (select auth_org_ids()));

-- =============================================================================
-- Seed: capabilities reference (mirrors lib/permissions/capabilities.ts)
-- =============================================================================
insert into capabilities (capability_key, group_label, label, min_level) values
  ('dashboard.view',          'Dashboard & Reports',          'View dashboard', 1),
  ('portfolio.view',          'Dashboard & Reports',          'View portfolio overview', 1),
  ('upload.file',             'Upload & Classification',      'Upload accounting file', 2),
  ('upload.remove',           'Upload & Classification',      'Remove uploaded file', 3),
  ('upload.replace',          'Upload & Classification',      'Replace uploaded file', 2),
  ('classification.review',   'Upload & Classification',      'Review classification', 2),
  ('class.add',               'Upload & Classification',      'Add class', 2),
  ('forecast.upload',         'Forecast & Budget',            'Upload forecast', 2),
  ('forecast.edit',           'Forecast & Budget',            'Edit forecast', 2),
  ('structure.edit',          'Cash Flow Structure',          'Edit cash flow structure', 3),
  ('period.approve_lock',     'Period Approval & Correction', 'Approve / lock / close period', 3),
  ('period.correction_mode',  'Period Approval & Correction', 'Enable correction mode', 3),
  ('period.set_opening_balance','Period Approval & Correction','Set opening balance manually', 3),
  ('export.excel',            'Export',                       'Export Excel', 1),
  ('export.pdf',              'Export',                       'Export PDF', 1),
  ('export.raw',              'Export',                       'Export raw transactions', 3),
  ('users.manage',            'Admin Settings',               'Manage users', 4),
  ('roles.manage',            'Admin Settings',               'Manage roles', 4),
  ('audit.view',              'Admin Settings',               'View audit log', 4),
  ('companies.manage',        'Company Management',           'Manage companies', 4),
  ('companies.add',           'Company Management',           'Add new company', 4),
  ('companies.edit',          'Company Management',           'Edit company settings', 4),
  ('companies.archive',       'Company Management',           'Archive company', 5),
  ('access.assign',           'Company Management',           'Assign company access', 4);

-- =============================================================================
-- Provisioning helpers
-- =============================================================================

-- Auto-create a profile row when a new auth user is created.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Seed an organization's system roles, default permissions and security settings,
-- and make p_owner the Owner. Run with the service-role client when provisioning.
create or replace function seed_org_defaults(p_org uuid, p_owner uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  owner_role uuid;
begin
  -- system roles
  insert into roles (org_id, key, name, description, is_system, level) values
    (p_org, 'owner',  'Owner',                 'Full control of all companies, users and settings.', true, 5),
    (p_org, 'admin',  'Admin',                 'Manage users, roles, companies and access.',          true, 4),
    (p_org, 'cfo',    'Finance Manager / CFO', 'Operational access: upload, classify, forecast, approve, lock/close, export.', true, 3),
    (p_org, 'editor', 'Accountant / Editor',   'Upload, classify and edit forecast. No approvals or admin.', true, 2),
    (p_org, 'viewer', 'Viewer',                'Read-only dashboards, cash flow and reports.',        true, 1)
  on conflict (org_id, key) do nothing;

  -- explicit defaults from level vs capability.min_level (keeps DB self-describing)
  for r in select id, level from roles where org_id = p_org and is_system loop
    insert into role_permissions (role_id, capability_key, allowed)
    select r.id, c.capability_key, (r.level >= c.min_level)
    from capabilities c
    on conflict (role_id, capability_key) do nothing;
  end loop;

  -- default security settings
  insert into security_settings (org_id) values (p_org)
  on conflict (org_id) do nothing;

  -- owner membership (org-level: company_id null)
  select id into owner_role from roles where org_id = p_org and key = 'owner';
  insert into memberships (org_id, user_id, company_id, role_id)
  values (p_org, p_owner, null, owner_role)
  on conflict (user_id, company_id) do nothing;
end;
$$;
