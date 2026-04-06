# ChatGPT movie ingest

Goal: add movies to space-settlement.net directly from ChatGPT instead of using the full admin editor.

Target endpoint:
POST /ingest/movie

Expected JSON body:
- title: required movie title
- url: optional source URL
- note: optional freeform note
- imageUrl: optional explicit poster URL

The endpoint should:
- require x-admin-token
- reuse metadata enrichment
- force type to movie
- create the item in items
- seed initial DE i18n rows for title and summary
- return the created item plus enrichment payload

Recommended worker changes in workers/spacesettlement-api/src/index.ts:
- extract resolveWikipediaUrl helper
- extract enrichMetadata helper
- extract insertItemRecord helper
- add POST /ingest/movie route
- keep POST /ai/enrich as a thin wrapper around enrichMetadata
- keep POST /items as a thin wrapper around insertItemRecord

ChatGPT action setup:
- use openapi/chatgpt-movie-ingest.openapi.yaml
- point server URL to the deployed worker
- provide x-admin-token as the action secret header

Outcome:
- ChatGPT becomes the input channel
- the existing website remains the display layer
- the admin page stays as fallback for manual correction
