-- =============================================================================
-- Financial Control Portal - 0015 classification source 'import' (Phase 5B)
--
-- Adds an 'import' value to the classification_source enum so summary actuals
-- imported from the workbook are auditable as a distinct source (vs manual/rule).
-- Additive only; existing manual/rule behavior unchanged. The cash-flow engine
-- treats import the same as manual/rule for eligibility (confirmed + sourced).
-- =============================================================================

alter type public.classification_source add value if not exists 'import';
