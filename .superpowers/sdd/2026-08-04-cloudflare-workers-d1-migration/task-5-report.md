# Task 5 report: profile and cloud-save routes

Implemented the protected D1-backed profile and cloud-save endpoints and registered both route groups in `worker/app.js`.

- Profile reads/updates return only `nickname`, `avatarUrl`, and `bio`; profile input is trimmed and validated for Unicode length and HTTPS avatar URLs.
- Cloud saves support first-write insert, optimistic version increments, stale/concurrent write conflicts, schema validation, protected `merit` rejection, and a 256 KiB UTF-8 payload limit.
- D1-unavailable failures are mapped to stable 503 responses and missing records to 404 responses.

Verification: `npm run worker:test -- worker/modules/profile worker/modules/save` (36 tests passed).
