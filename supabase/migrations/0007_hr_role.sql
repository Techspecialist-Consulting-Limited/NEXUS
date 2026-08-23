-- ============================================================================
-- NEXUS 0007 — HR joins the role set
--
-- This migration does exactly one thing, and it is deliberately alone in its
-- own file.
--
-- Postgres will not let a newly added enum value be USED in the same
-- transaction that adds it, and the membership work in 0008 needs to write
-- policies and function bodies that reference 'hr'. Splitting on the
-- transaction boundary is the standard remedy.
--
-- Recreating the type instead is not an option here: current_org_role()
-- returns org_role, and every RLS policy in 0006 depends on that function, so
-- dropping it to swap the type would take the entire security model with it.
--
-- HR sits between lead and executive: broader reach than a single unit, but
-- its authority is over compliance rather than over the business.
-- ============================================================================

alter type org_role add value if not exists 'hr' before 'executive';
