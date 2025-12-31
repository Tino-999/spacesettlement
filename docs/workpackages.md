============================================================

SpaceSettlement – WORK\_PACKAGES (ASCII DOCUMENT)

============================================================



PURPOSE

-------

Defines the complete, ordered set of work packages required to

implement the admin ingestion system, backend support, AI-assisted

descriptions, and lifecycle management.



This document is normative.

Work packages are processed strictly in order.



------------------------------------------------------------

GLOBAL RULES

------------------------------------------------------------

\- One work package at a time.

\- A work package is complete only when:

&nbsp; - Code is implemented

&nbsp; - Behavior matches documentation

&nbsp; - No scope creep occurred

\- No work package modifies frozen documents retroactively.



------------------------------------------------------------

WP-01 — ARCHITECTURE FREEZE

------------------------------------------------------------

Goal

----

Establish a stable architectural baseline.



Scope

-----

\- ARCHITECTURE\_V2.md

\- Classification structure

\- Type system

\- Provider policy

\- AI role definition



Tasks

-----

\- Finalize canonical types.

\- Finalize project\_class and fiction\_class.

\- Finalize topic vocabulary.

\- Declare non-goals.



Exit Criteria

-------------

\- ARCHITECTURE\_V2.md is complete.

\- No open architectural questions.



------------------------------------------------------------

WP-02 — DATA MODEL FINALIZATION

------------------------------------------------------------

Goal

----

Bind architecture to a concrete database schema.



Scope

-----

\- DATA\_MODEL.md

\- D1 table definition

\- Validation rules



Tasks

-----

\- Define items table fields.

\- Define lifecycle fields.

\- Define classification constraints.

\- Define meta storage rules.



Exit Criteria

-------------

\- DATA\_MODEL.md complete.

\- Schema is unambiguous.

\- No implicit fields remain.



------------------------------------------------------------

WP-03 — INGESTION SOURCES

------------------------------------------------------------

Goal

----

Define and lock external data sources.



Scope

-----

\- INGESTION\_SOURCES.md



Tasks

-----

\- Finalize provider mapping.

\- Define suggest usage rules.

\- Define enrich usage rules.

\- Define change policy.



Exit Criteria

-------------

\- Exactly one provider per type.

\- No optional or fallback sources.



------------------------------------------------------------

WP-04 — BACKEND API IMPLEMENTATION

------------------------------------------------------------

Goal

----

Implement all documented API endpoints.



Scope

-----

\- BACKEND\_API.md

\- Worker implementation

\- D1 integration



Tasks

-----

\- Public GET /items

\- Admin POST /items/upsert

\- Publish / delete / restore / purge

\- Suggest endpoint

\- Enrich endpoint

\- Describe endpoint



Exit Criteria

-------------

\- All endpoints implemented.

\- Validation enforced.

\- No undocumented endpoints exist.



------------------------------------------------------------

WP-05 — ADMIN UI STRUCTURE

------------------------------------------------------------

Goal

----

Implement admin.html layout and controls.



Scope

-----

\- admin.html

\- admin.js (or equivalent)



Tasks

-----

\- Type selector

\- Title input with typeahead

\- Classification chips

\- Topic chips

\- Optional field inputs



Exit Criteria

-------------

\- UI renders correctly.

\- No backend calls yet.

\- No persistence logic.



------------------------------------------------------------

WP-06 — ADMIN ↔ BACKEND INTEGRATION

------------------------------------------------------------

Goal

----

Connect admin UI to backend endpoints.



Scope

-----

\- API wiring

\- State handling



Tasks

-----

\- Suggest integration

\- Enrich integration

\- Draft save (upsert)

\- Publish action

\- Delete / restore / purge actions



Exit Criteria

-------------

\- Full CRUD works via UI.

\- No silent failures.

\- Errors are visible.



------------------------------------------------------------

WP-07 — AI-ASSISTED DESCRIPTIONS

------------------------------------------------------------

Goal

----

Enable controlled AI text suggestions.



Scope

-----

\- /describe endpoint

\- Admin UI integration



Tasks

-----

\- Prompt template implementation

\- Max-length constraints

\- Preview-only UI

\- Manual acceptance workflow



Exit Criteria

-------------

\- AI never writes to DB directly.

\- Admin confirmation required.

\- No factual expansion beyond meta.



------------------------------------------------------------

WP-08 — AUDIT AND SAFETY

------------------------------------------------------------

Goal

----

Ensure traceability and controlled deletion.



Scope

-----

\- Audit logging

\- Delete behavior



Tasks

-----

\- Log write operations.

\- Ensure soft-delete default.

\- Restrict purge to admin.



Exit Criteria

-------------

\- All writes are auditable.

\- Deleted content is never public.



------------------------------------------------------------

WP-09 — VALIDATION AND HARDENING

------------------------------------------------------------

Goal

----

Prevent data corruption.



Scope

-----

\- Backend validation

\- Admin input validation



Tasks

-----

\- Enforce enum constraints.

\- Reject invalid topics.

\- Reject invalid type/class combos.



Exit Criteria

-------------

\- Invalid data cannot be persisted.

\- Errors are explicit.



------------------------------------------------------------

WP-10 — DOCUMENTATION CLOSURE

------------------------------------------------------------

Goal

----

Close the documentation loop.



Scope

-----

\- All /docs files



Tasks

-----

\- Cross-check documents.

\- Remove deprecated references.

\- Mark ARCHITECTURE.md as obsolete.



Exit Criteria

-------------

\- Documentation is consistent.

\- No duplicate or conflicting rules.



------------------------------------------------------------

EXECUTION ORDER (MANDATORY)

------------------------------------------------------------

WP-01

WP-02

WP-03

WP-04

WP-05

WP-06

WP-07

WP-08

WP-09

WP-10



------------------------------------------------------------

END OF DOCUMENT

------------------------------------------------------------



