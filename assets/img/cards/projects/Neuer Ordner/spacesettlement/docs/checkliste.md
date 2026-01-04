============================================================

SpaceSettlement – IMPLEMENTATION CHECKLIST (ASCII)

============================================================



PURPOSE

-------

Concrete, step-by-step checklist for implementing the admin ingestion

system.

Each checkbox represents an explicit action.

No step is implicit.



------------------------------------------------------------

PRECONDITIONS

------------------------------------------------------------

\[ ] main branch is clean and deployed

\[ ] feature/admin-ingestion-v2 branch exists

\[ ] /docs directory exists

\[ ] ARCHITECTURE\_V2.md frozen

\[ ] DATA\_MODEL.md frozen

\[ ] INGESTION\_SOURCES.md frozen

\[ ] BACKEND\_API.md frozen

\[ ] WORK\_PACKAGES.md frozen



------------------------------------------------------------

CHECKLIST A — DATABASE (D1)

------------------------------------------------------------

\[ ] items table exists

\[ ] id TEXT PRIMARY KEY

\[ ] type TEXT NOT NULL

\[ ] title TEXT NOT NULL

\[ ] status TEXT NOT NULL

\[ ] createdAt TEXT NOT NULL

\[ ] updatedAt TEXT NOT NULL

\[ ] deletedAt TEXT NULL

\[ ] href TEXT NULL

\[ ] imageUrl TEXT NULL

\[ ] summary TEXT NULL

\[ ] tags TEXT NULL

\[ ] sortYear INTEGER NULL

\[ ] birthYear INTEGER NULL

\[ ] deathYear INTEGER NULL

\[ ] project\_class TEXT NULL

\[ ] fiction\_class TEXT NULL

\[ ] topics TEXT NULL

\[ ] meta TEXT NULL (JSON)



------------------------------------------------------------

CHECKLIST B — BACKEND VALIDATION

------------------------------------------------------------

\[ ] type validated against canonical list

\[ ] status validated (draft/published/deleted)

\[ ] project\_class allowed only if type=PROJECT

\[ ] fiction\_class allowed only if type=FICTION

\[ ] topics validated against controlled vocabulary

\[ ] birthYear/deathYear allowed only if type=PERSON

\[ ] deletedAt NULL unless status=deleted

\[ ] meta validated as valid JSON



------------------------------------------------------------

CHECKLIST C — PUBLIC API

------------------------------------------------------------

\[ ] GET /items implemented

\[ ] status='published' enforced

\[ ] filtering by type works

\[ ] filtering by project\_class works

\[ ] filtering by fiction\_class works

\[ ] filtering by topic works

\[ ] search by title/summary works

\[ ] meta excluded by default



------------------------------------------------------------

CHECKLIST D — ADMIN API (CORE)

------------------------------------------------------------

\[ ] Admin auth via X-Admin-Token enforced

\[ ] POST /items/upsert implemented

\[ ] POST /items/:id/publish implemented

\[ ] POST /items/:id/delete implemented

\[ ] POST /items/:id/restore implemented

\[ ] DELETE /items/:id/purge implemented

\[ ] updatedAt always set server-side

\[ ] createdAt set only on create



------------------------------------------------------------

CHECKLIST E — SUGGEST

------------------------------------------------------------

\[ ] GET /suggest implemented

\[ ] q length >= 2 enforced

\[ ] type parameter required

\[ ] Provider mapping correct

\[ ] Wikidata wired for non-books

\[ ] Open Library wired for books

\[ ] No DB writes in suggest



------------------------------------------------------------

CHECKLIST F — ENRICH

------------------------------------------------------------

\[ ] GET /enrich implemented

\[ ] type/source/sourceId required

\[ ] Prefill fields mapped correctly

\[ ] meta payload returned

\[ ] No DB writes in enrich



------------------------------------------------------------

CHECKLIST G — AI DESCRIPTION

------------------------------------------------------------

\[ ] POST /describe implemented

\[ ] Uses only provided input

\[ ] maxChars constraint respected

\[ ] No DB writes

\[ ] No hallucinated facts allowed

\[ ] Output marked as candidate only



------------------------------------------------------------

CHECKLIST H — ADMIN UI: STRUCTURE

------------------------------------------------------------

\[ ] admin.html exists

\[ ] Type selector implemented

\[ ] Title input with typeahead

\[ ] Project class chips (PROJECT only)

\[ ] Fiction class chips (FICTION only)

\[ ] Topic chips (all types)

\[ ] Optional fields visible

\[ ] Save Draft button exists

\[ ] Publish button exists

\[ ] Delete / Restore / Purge buttons exist



------------------------------------------------------------

CHECKLIST I — ADMIN UI: INTEGRATION

------------------------------------------------------------

\[ ] Suggest wired to title input

\[ ] Enrich button wired

\[ ] AI Describe button wired

\[ ] Upsert saves draft

\[ ] Publish updates status

\[ ] Delete performs soft-delete

\[ ] Restore returns to draft

\[ ] Purge permanently deletes

\[ ] Error messages visible to admin



------------------------------------------------------------

CHECKLIST J — LIFECYCLE \& SAFETY

------------------------------------------------------------

\[ ] Drafts never visible publicly

\[ ] Deleted items never visible publicly

\[ ] Restore does not auto-publish

\[ ] Purge restricted to admin

\[ ] No background jobs modify data



------------------------------------------------------------

CHECKLIST K — FINAL VERIFICATION

------------------------------------------------------------

\[ ] Manual item creation works

\[ ] Suggest-based creation works

\[ ] Enrich fills meta correctly

\[ ] AI description is optional

\[ ] Published items appear on site

\[ ] Deleted items disappear from site

\[ ] No schema drift observed



------------------------------------------------------------

COMPLETION RULE

------------------------------------------------------------

The system is considered complete only if:

\- All checkboxes are satisfied

\- Behavior matches documentation exactly

\- No undocumented behavior exists



------------------------------------------------------------

END OF CHECKLIST

------------------------------------------------------------



