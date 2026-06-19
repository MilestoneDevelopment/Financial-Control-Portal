-- =============================================================================
-- Financial Control Portal - 0008 FX resolution & file lifecycle (Phase 2C)
-- Adds the privileges/policies needed to (a) resolve FX onto transactions and
-- (b) remove uploaded files, plus a hardened FX-rate cache function. No new
-- tables. Security posture preserved: RLS stays the gate, no anon grants, no
-- direct service_role table DML, storage bucket stays private.
-- =============================================================================

-- transactions: allow FX-resolution UPDATEs (gated by upload.file).
create policy tx_update on transactions for update to authenticated
  using (auth_can('upload.file', company_id))
  with check (auth_can('upload.file', company_id));
grant update on public.transactions to authenticated;

-- accounting_files: allow remove (gated by upload.remove). Child transactions /
-- issues are removed via ON DELETE CASCADE (no child DELETE grant required).
create policy acc_files_delete on accounting_files for delete to authenticated
  using (auth_can('upload.remove', company_id));
grant delete on public.accounting_files to authenticated;

-- Storage: allow deleting accounting-files objects for users with company access
-- AND upload.remove. Bucket remains private; read/upload policies (0007) unchanged.
create policy "accounting_files_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'accounting-files'
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
    and auth_can('upload.remove', (storage.foldername(name))[1]::uuid)
  );

-- FX cache: SECURITY DEFINER upsert so authenticated callers can populate the
-- national fx_rates table (from NBG lookups) WITHOUT a direct INSERT grant -
-- keeps the reference table hardened. Restricted to NBG-sourced rows; existing
-- (currency, date, source) rows are never overwritten.
create or replace function cache_fx_rate(
  p_currency currency,
  p_date date,
  p_rate numeric,
  p_source fx_rate_source
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_source not in ('nbg', 'nbg_prior_filled') then
    raise exception 'cache_fx_rate only accepts nbg / nbg_prior_filled sources.';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'cache_fx_rate requires a positive rate.';
  end if;
  insert into fx_rates (quote_currency, rate_date, rate, source)
  values (p_currency, p_date, p_rate, p_source)
  on conflict (quote_currency, rate_date, source) do nothing;
end;
$$;

revoke execute on function cache_fx_rate(currency, date, numeric, fx_rate_source) from public, anon;
grant  execute on function cache_fx_rate(currency, date, numeric, fx_rate_source) to authenticated;
