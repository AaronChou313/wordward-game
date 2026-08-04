# Task 5 report: profile and cloud-save routes

Implemented the protected D1-backed profile and cloud-save endpoints and registered both route groups in `worker/app.js`.

- Profile reads/updates return only `nickname`, `avatarUrl`, and `bio`; profile input is trimmed and validated for Unicode length and HTTPS avatar URLs.
- Cloud saves support first-write insert, optimistic version increments, stale/concurrent write conflicts, schema validation, protected `merit` rejection, and a 256 KiB UTF-8 payload limit.
- D1-unavailable failures are mapped to stable 503 responses and missing records to 404 responses.

Verification: `npm run worker:test -- worker/modules/profile/profile.test.js worker/modules/save/save.test.js` (36 tests passed); `npm run worker:test` (36 tests passed).

Follow-up hardening added a deterministic concurrent first-save regression. Its stateful fake D1 blocks both `INSERT ... ON CONFLICT DO NOTHING` calls at a shared barrier before allowing the atomic winner/loser decision, then asserts exactly one `200`, one `409`, and that the conflict response reports the winning current save.
