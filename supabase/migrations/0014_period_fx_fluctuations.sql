-- =============================================================================
-- Financial Control Portal - 0014 period FX fluctuations (Phase 5B)
--
-- Stores a period's monthly FX fluctuation (in GEL) so the cash balance bridge
-- reconciles exactly: Closing Cash Balance = Opening + Net Cash Flow + FX.
-- Nullable (null treated as 0.00 in display/compute). Imported from actuals;
-- editable FX UI is out of scope for this phase (read-only on the page).
-- =============================================================================

alter table public.periods add column if not exists fx_fluctuations_gel numeric(18, 2);

comment on column public.periods.fx_fluctuations_gel is
  'Period FX fluctuation in GEL (actual). Cash bridge: Closing = Opening + Net + FX.';
