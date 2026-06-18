-- =============================================================================
-- Financial Control Portal - 0003 cash-flow structure nodes
-- Adds the cf_nodes tree (Section -> Group -> Class) scoped to a structure
-- version. Class = cash flow line item. Preserves the RLS / capability model;
-- does not alter 0001/0002 objects.
-- =============================================================================

create type cf_node_kind as enum ('section', 'group', 'class');
create type cash_direction as enum ('in', 'out', 'neutral');

create table cf_nodes (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies (id) on delete cascade,
  structure_version_id  uuid not null references cf_structure_versions (id) on delete cascade,
  parent_id             uuid references cf_nodes (id) on delete cascade,
  kind                  cf_node_kind not null,
  label                 text not null,
  sort_order            integer not null default 0,
  cash_direction        cash_direction not null default 'neutral', -- meaningful for classes
  is_active             boolean not null default true,
  dept                  text,
  created_at            timestamptz not null default now()
);

create index idx_cf_nodes_version on cf_nodes (structure_version_id, parent_id, sort_order);
create index idx_cf_nodes_company on cf_nodes (company_id);
create index idx_cf_nodes_parent on cf_nodes (parent_id);

alter table cf_nodes enable row level security;

create policy cf_nodes_select on cf_nodes for select to authenticated
  using (company_id in (select auth_company_ids()));

create policy cf_nodes_write on cf_nodes for all to authenticated
  using (auth_can('structure.edit', company_id))
  with check (auth_can('structure.edit', company_id));
