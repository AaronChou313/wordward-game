# Task 2 Report: D1 schema, migration commands, and database helpers

## Changes

- Added the initial six-table D1 schema and supporting indexes in `migrations/0001_initial.sql`.
- Added prepared-statement helpers (`run`, `first`, `all`, `batch`), row converters, and stable D1 conflict/unavailable errors under `worker/db/`.
- Added local, preview, and production D1 migration scripts plus the `d1:test` script in `package.json`.
- The local migration script explicitly selects the preview environment so Wrangler resolves its D1 binding (`--env preview --local`).
- Filtered Wrangler's internal `_cf_METADATA` table from the schema test; corrected the checkpoint fixture SQL and profile cascade assertion.
- Scoped `migrations_dir` to the preview and production D1 bindings in `wrangler.jsonc` (top-level configuration produced an unexpected-field warning).
- D1 error classification now traverses wrapped `Error.cause` values and SQLite error codes/messages, preserving uniqueness and foreign-key failures as `D1ConflictError`.

## Verification

`npm run d1:test -- --run`

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

`npx wrangler deploy --dry-run --env preview`

```text
✨ Read 3 files from the assets directory /Users/aaron/Projects/wordward-game/dist
Total Upload: 63.86 KiB / gzip: 15.53 KiB
--dry-run: exiting now.
```

The dry run listed the preview D1 (`wordward-preview`), all four rate-limit bindings, and Assets. No `migrations_dir` warning remains.

`npx wrangler d1 migrations list wordward-preview --env preview --local` lists `0001_initial.sql` as pending, confirming the local migration command resolves the configured binding.

## Concerns

- Preview and production D1 `database_id` values remain placeholders and must be replaced with Cloudflare-provisioned IDs before remote migration/deployment.
- Rate-limit namespace IDs are placeholders pending Cloudflare provisioning.
- The test uses Wrangler's ephemeral local D1 proxy; run the migration scripts separately against the intended database before deployment.

## Review Fix: Worker-safe D1 error classification

- Removed the `process.env.DEBUG_D1` access from `worker/db/queries.js`; production Workers do not provide the Node `process` global without `nodejs_compat`, and D1 failures must still be classified safely.
- Added a focused regression test that temporarily removes `globalThis.process` and verifies wrapped SQLite uniqueness errors classify as `D1ConflictError` while generic failures classify as `D1UnavailableError`.

### Fix Verification

`npm run d1:test -- --run`

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

`npx wrangler deploy --dry-run --env preview`

```text
--dry-run: exiting now.
```
