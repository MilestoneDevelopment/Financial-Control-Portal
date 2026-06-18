-- =============================================================================
-- Financial Control Portal - 0002 security hardening
-- Close the PostgREST RPC exposure of SECURITY DEFINER provisioning/trigger
-- helpers. Minimal and safe: only the functions that must never be called by
-- normal API users are locked down.
--
-- NOT touched (intentionally):
--   * auth_org_ids / auth_company_ids / auth_role_for_company / auth_role_for_org
--     / auth_can / auth_can_org  -> required by RLS policies; the querying
--     (authenticated) role MUST retain EXECUTE or every policy that calls them
--     would fail. Their RPC exposure is low risk (they only read auth.uid()).
--   * rls_auto_enable() -> pre-existing project/Postgres event-trigger guardrail,
--     not owned by this migration.
-- =============================================================================

-- seed_org_defaults: provisioning helper. Must only be callable by trusted
-- server-side code (service_role), never by anon/authenticated via RPC.
revoke execute on function public.seed_org_defaults(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.seed_org_defaults(uuid, uuid) to service_role;

-- handle_new_user: trigger function. The trigger fires regardless of caller
-- EXECUTE grants, so removing API EXECUTE does not affect on_auth_user_created.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
