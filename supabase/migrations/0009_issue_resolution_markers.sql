-- =============================================================================
-- Financial Control Portal - 0009 issue resolution markers (Phase 2D polish)
-- Lets a successful Resolve FX mark the matching parse-time MISSING_FX issues as
-- resolved (instead of deleting history). Adds resolved_at / resolved_by /
-- resolution_note + a narrow UPDATE policy + grant on accounting_file_issues.
-- No new tables. Security posture unchanged: RLS stays the gate, no anon grants,
-- no service_role DML, bucket stays private.
-- =============================================================================

alter table accounting_file_issues
  add column resolved_at     timestamptz,
  add column resolved_by     uuid references profiles (id) on delete set null,
  add column resolution_note text;

-- Allow marking issues resolved (gated by upload.file, same as the FX resolver).
create policy acc_issues_update on accounting_file_issues for update to authenticated
  using (auth_can('upload.file', company_id))
  with check (auth_can('upload.file', company_id));
grant update on public.accounting_file_issues to authenticated;
