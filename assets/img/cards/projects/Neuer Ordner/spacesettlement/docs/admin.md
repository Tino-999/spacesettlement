============================================================

SpaceSettlement – ADMIN INGESTION \& WORKFLOW (ASCII DOCUMENT)

============================================================



PURPOSE

-------

Defines the complete admin-sideingestion, editing, enrichment,

AI-assisted description, publishing, and deletion workflow.

This document is normative.



------------------------------------------------------------

SYSTEM BOUNDARY

------------------------------------------------------------

\- Applies only to admin.html and admin API endpoints.

\- Public frontend is read-only.

\- No background jobs.

\- No automated writes without explicit admin action.



------------------------------------------------------------

ADMIN UI: admin.html

------------------------------------------------------------



UI SECTIONS (TOP TO BOTTOM)



1\. TYPE SELECTION

-----------------

Field:

\- type (dropdown, required)



Allowed values:

\- PROJECT

\- FICTION

\- CONCEPT

\- TOPIC

\- ORG

\- PERSON

\- BOOK

\- MOVIE



Effect:

\- Determines:

&nbsp; - available class chips

&nbsp; - provider for suggest/enrich

&nbsp; - visible optional fields



------------------------------------------------------------



2\. TITLE + TYPEAHEAD (PRIMARY ENTRY)

------------------------------------

Field:

\- title (text input with typeahead)



Behavior:

\- On input length >= 2:

&nbsp; - calls GET /suggest?q=\&type=

\- Results shown as dropdown list.



Suggestion entry contains:

\- label

\- short description (if available)

\- source + sourceId (hidden)



User actions:

\- Select suggestion

&nbsp; -> pre-fills title

&nbsp; -> stores source + sourceId in memory (not persisted)

\- Or ignore suggestions and type manually



No database write occurs here.



------------------------------------------------------------



3\. CLASSIFICATION CHIPS

----------------------



3.1 PROJECT CLASS (only if type=PROJECT)



Chips (single-select):

\- CLASS I

\- CLASS II

\- CLASS III

\- CLASS IV

\- CLASS V



Stored in:

\- project\_class



------------------------------------------------------------



3.2 FICTION CLASS (only if type=FICTION)



Chips (single-select):

\- CLASS A

\- CLASS B

\- CLASS C

\- CLASS D



Stored in:

\- fiction\_class



------------------------------------------------------------



3.3 TOPICS (all types)



Chips (multi-select, controlled vocabulary):



SETTLEMENT ARCHITECTURES

\- Generation ships

\- Space habitats (rotational)

\- Planetary surface settlements

\- Subsurface habitats

\- Mobile vs. fixed settlements



LAW

\- Space treaties and principles

\- Jurisdiction and governance off-Earth

\- Property and resource rights

\- Liability and insurance

\- Labor and crew status

\- Bioethics and medical law

\- Heritage and environmental protection



RELIGION

\- Religious practice in confined environments

\- Timekeeping and calendars off-Earth

\- Dietary rules and life-support constraints

\- Rituals, death, and handling of remains

\- Chaplaincy and psychological interfaces

\- Freedom of religion in settlements



Stored in:

\- topics (flat string list)



------------------------------------------------------------



4\. OPTIONAL MANUAL FIELDS

------------------------

\- href

\- imageUrl

\- sortYear

\- birthYear (PERSON only)

\- deathYear (PERSON only)



All optional.

No field is auto-required by the UI.



------------------------------------------------------------



5\. ENRICHMENT

-------------

Button:

\- "Enrich from Source"



Behavior:

\- Calls GET /enrich?type=\&source=\&sourceId=

\- Requires that a suggestion was previously selected

&nbsp; OR a sourceId was manually entered.



Response handling:

\- Prefill candidates shown in editable fields:

&nbsp; - title

&nbsp; - href

&nbsp; - imageUrl

&nbsp; - summary (candidate only)

&nbsp; - sortYear

\- meta payload stored in memory



Rules:

\- No automatic persistence.

\- Admin must explicitly save.



------------------------------------------------------------



6\. AI-ASSISTED DESCRIPTION

-------------------------

Button:

\- "Generate Description"



Behavior:

\- Calls POST /describe



Input:

\- type

\- title

\- href

\- meta

\- constraints (e.g. maxChars)



Output:

\- summary\_candidate



UI handling:

\- summary\_candidate shown in preview field

\- Admin may:

&nbsp; - copy to summary

&nbsp; - edit

&nbsp; - discard



Rules:

\- AI output is never auto-saved.

\- AI output is not authoritative.



------------------------------------------------------------



7\. SAVE (UPSERT)

----------------

Button:

\- "Save Draft"



Behavior:

\- Calls POST /items/upsert



Result:

\- Item stored with:

&nbsp; - status = draft

&nbsp; - updatedAt set

&nbsp; - createdAt set if new



------------------------------------------------------------



8\. PUBLISH

----------

Button:

\- "Publish"



Behavior:

\- Calls POST /items/:id/publish



Result:

\- status = published

\- Item becomes publicly visible



------------------------------------------------------------



9\. DELETE / RESTORE / PURGE

--------------------------



Delete (default):

\- Button: "Delete"

\- Calls POST /items/:id/delete

\- status = deleted

\- deletedAt set



Restore:

\- Button: "Restore"

\- Calls POST /items/:id/restore

\- status = draft



Purge (admin-only, destructive):

\- Button: "Purge"

\- Calls DELETE /items/:id/purge

\- Row removed permanently



------------------------------------------------------------

LIFECYCLE SUMMARY

------------------------------------------------------------



create  -> draft

draft   -> published

draft   -> deleted

published -> deleted

deleted -> draft (restore)

deleted -> purged (final)



------------------------------------------------------------

STRICT NON-BEHAVIORS

------------------------------------------------------------

\- No automatic publishing.

\- No background enrichment.

\- No automatic re-enrichment.

\- No AI-generated facts without admin confirmation.

\- No hidden classification logic.

\- No schema mutation from admin UI.



------------------------------------------------------------

END OF DOCUMENT

------------------------------------------------------------



