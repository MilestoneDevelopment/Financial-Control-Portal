-- =============================================================================
-- Financial Control Portal - 0006 audit actor default
-- audit_log.actor had no default and lib/audit.ts does not set it, so every
-- audit row recorded actor = NULL (the "who" was lost). Default it to auth.uid()
-- so authenticated server actions capture the acting user automatically.
--
-- Safe for all paths: authenticated inserts (the only logAudit caller) resolve
-- auth.uid() to the user; any future service-role/system insert yields NULL,
-- exactly as today -- no breakage. Affects future inserts only; existing rows
-- are unchanged and the table is not rewritten. RLS, append-only policies, and
-- the 0002/0004/0005 hardening are untouched.
-- =============================================================================

alter table public.audit_log alter column actor set default auth.uid();
