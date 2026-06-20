-- =============================================================================
-- Financial Control Portal - 0012 opening-balance lifecycle guard (Phase 4C QA)
--
-- set_period_opening_balance (0011) enforced the period.set_opening_balance
-- capability but not the period lifecycle. That allowed an opening balance to be
-- changed on a locked/closed period without Correction Mode - not acceptable in a
-- financial-control system.
--
-- This redefinition adds the lifecycle guard, reusing the EXISTING Correction
-- Mode mechanism (periods.is_correction_mode): writable only when the period is
-- draft/active, or locked/closed WITH correction mode enabled. The capability
-- check, least-privilege column scope, and grants are unchanged. No table policy
-- is broadened.
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
  v_company    uuid;
  v_status     period_status;
  v_correction boolean;
begin
  select company_id, status, is_correction_mode
    into v_company, v_status, v_correction
  from periods where id = p_period_id;
  if v_company is null then
    raise exception 'Period % not found.', p_period_id;
  end if;

  -- least privilege: opening-balance writes require period.set_opening_balance
  if not auth_can('period.set_opening_balance', v_company) then
    raise exception 'Not authorized to set the opening balance for this period.';
  end if;

  -- lifecycle guard: locked/closed periods need Correction Mode (existing model)
  if not (
    v_status in ('draft', 'active')
    or (v_status in ('locked', 'closed') and coalesce(v_correction, false))
  ) then
    raise exception
      'This period is % - enable Correction Mode to change its opening balance.', v_status;
  end if;

  if p_source not in ('manual', 'carried') then
    raise exception 'set_period_opening_balance only accepts manual or carried sources.';
  end if;
  if p_amount is null then
    raise exception 'Opening balance amount is required.';
  end if;

  update periods
     set opening_balance        = p_amount,
         opening_balance_source = p_source,
         opening_balance_set_by = auth.uid(),
         opening_balance_set_at = now()
   where id = p_period_id;
end;
$$;

revoke execute on function public.set_period_opening_balance(uuid, numeric, opening_balance_source) from public, anon;
grant  execute on function public.set_period_opening_balance(uuid, numeric, opening_balance_source) to authenticated;
