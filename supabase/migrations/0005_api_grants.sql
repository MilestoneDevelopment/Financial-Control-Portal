-- =============================================================================
-- Financial Control Portal - 0005 API base-table grants for `authenticated`
-- The project's hardened template stripped the default table privileges, so the
-- `authenticated` role could reach no public table (only REFERENCES/TRIGGER/
-- TRUNCATE). RLS is enabled with per-command policies on every table, but RLS
-- only filters rows *after* a base privilege check -- with no SELECT/INSERT/
-- UPDATE grant, PostgREST returned "permission denied for table companies".
--
-- This migration restores the MINIMUM privileges the app needs as `authenticated`
-- and relies on the existing RLS policies as the access-control layer:
--   * SELECT on every table (each has a *_select RLS policy gating rows).
--   * INSERT/UPDATE only where Phase 1 server actions write (RLS gates by
--     capability): companies, periods, cf_nodes.
--   * INSERT only where the app appends: cf_structure_versions, audit_log
--     (audit_log stays append-only -- no UPDATE/DELETE).
--   * profiles own-row INSERT/UPDATE (gated by profile_*_own policies).
--
-- Deliberately NOT changed (preserves 0002/0004 hardening):
--   * No privileges granted to `anon`.
--   * No direct table DML granted to `service_role`.
--   * No DELETE granted to anyone.
--   * provision_org / seed_org_defaults / handle_new_user remain locked
--     (no EXECUTE for anon/authenticated). RLS stays enabled and unchanged.
-- =============================================================================

-- read access (RLS *_select policies do the row filtering)
grant select on
  public.organizations, public.profiles, public.roles, public.capabilities,
  public.role_permissions, public.companies, public.memberships,
  public.security_settings, public.invitations, public.fx_rates,
  public.cf_structure_versions, public.cf_nodes, public.periods, public.audit_log
to authenticated;

-- write access, scoped to what Phase 1 server actions actually do (RLS-gated)
grant insert, update on public.companies to authenticated;
grant insert, update on public.periods  to authenticated;
grant insert, update on public.cf_nodes to authenticated;
grant insert         on public.cf_structure_versions to authenticated;
grant insert         on public.audit_log to authenticated;  -- append-only
grant insert, update on public.profiles to authenticated;   -- own row only (RLS)
