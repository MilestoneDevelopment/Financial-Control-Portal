-- =============================================================================
-- Financial Control Portal - 0011 period opening-balance writes (Phase 4C)
--
-- Fixes the opening-balance authorization gap with least privilege.
--
-- Background: periods_write (0001) is `for all` gated by period.approve_lock, so
-- every period write (status, locks, opening balance) currently needs the full
-- period-management capability. Opening-balance edits should instead be gated by
-- the dedicated period.set_opening_balance capability.
--
-- Why a SECURITY DEFINER function and not a second UPDATE policy: RLS is
-- row-level, not column-level. A permissive UPDATE policy gated on
-- period.set_opening_balance would also let those holders change status, lock
-- flags, etc. (any column). A definer function scopes the write by BOTH the
-- capability AND the exact columns, which is genuinely least privilege - the same
-- hardened pattern as cache_fx_rate / provision_org. periods_write (lifecycle,
-- period.approve_lock) is left untouched; period creation stays under it.
--
-- Adds no new table privileges and does not alter existing objects/policies.
-- =============================================================================

create or replace function public.set_period_opening_balance(
  p_period_id uuid,
  p_amount numeric,
  p_source opening_balance_source
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid;
begin
  -- locate the period and its company (definer context bypasses RLS, so the
  -- capability check below is the real authorization boundary)
  select company_id into v_company from periods where id = p_period_id;
  if v_company is null then
    raise exception 'Period % not found.', p_period_id;
  end if;

  -- least privilege: opening-balance writes require period.set_opening_balance
  if not auth_can('period.set_opening_balance', v_company) then
    raise exception 'Not authorized to set the opening balance for this period.';
  end if;

  -- only the two app-driven sources are accepted here; imported openings arrive
  -- through the upload pipeline, not this function
  if p_source not in ('manual', 'carried') then
    raise exception 'set_period_opening_balance only accepts manual or carried sources.';
  end if;
  if p_amount is null then
    raise exception 'Opening balance amount is required.';
  end if;

  -- write ONLY the opening-balance columns; never touches status/locks/etc.
  update periods
     set opening_balance        = p_amount,
         opening_balance_source = p_source,
         opening_balance_set_by = auth.uid(),
         opening_balance_set_at = now()
   where id = p_period_id;
end;
$$;

-- callable by signed-in users only; never anon/public. The internal capability
-- check enforces period.set_opening_balance per company.
revoke execute on function public.set_period_opening_balance(uuid, numeric, opening_balance_source) from public, anon;
grant  execute on function public.set_period_opening_balance(uuid, numeric, opening_balance_source) to authenticated;
