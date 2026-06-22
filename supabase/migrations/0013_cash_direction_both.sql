-- =============================================================================
-- Financial Control Portal - 0013 bidirectional cash direction (Phase 5A)
--
-- Adds a 'both' value to the cash_direction enum so a single cash-flow line can
-- carry both inflow and outflow movements across periods (e.g. Capital
-- contributions: equity in, or return of capital out). A 'both' class preserves
-- the transaction's signed amount as-is (positive increases, negative decreases)
-- and rolls into parent totals with that sign. Existing 'in' / 'out' / 'neutral'
-- behavior is unchanged. Additive only; no data backfill here.
-- =============================================================================

alter type public.cash_direction add value if not exists 'both';
