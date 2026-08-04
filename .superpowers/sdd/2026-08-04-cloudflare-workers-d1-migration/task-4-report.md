# Task 4 report: authentication and session routes

Implemented the Worker/D1 authentication module in `worker/modules/auth/` and registered the routes in `worker/app.js`.

## Delivered

- Registration validates credentials, applies the registration limit and Turnstile before PBKDF2, and atomically inserts the user, profile, and refresh token with D1 `batch()`.
- Login validates limits and Turnstile before KDF work, performs a fixed dummy PBKDF2 verification for unknown users, and returns one generic invalid-credentials response for unknown, incorrect, or disabled accounts.
- Password records persist the configured PBKDF2 version and iteration count.
- Refresh tokens use Web Crypto HMAC pepper hashes. Rotation generates the candidate ID/value first, conditionally updates `rotated_to_id`, and inserts the successor only when that candidate ID matches, allowing only one concurrent rotation and rejecting replays.
- Logout revokes the presented token and always clears the refresh cookie.
- Added bearer-token middleware that verifies the JWT and re-checks the user status before attaching the public user to Hono context.

## Verification

```text
$ npm run worker:test -- worker/modules/auth/auth.test.js
Test Files  4 passed (4)
Tests       21 passed (21)

$ npm run build
✓ built in 29ms
```

The focused auth test currently covers credential schema behavior; the Worker security and D1 suites also pass as part of the command because the package script includes the `worker` directory.

## Concerns

- Turnstile is intentionally required whenever `TURNSTILE_SECRET_KEY` is configured (and fails closed when absent), so local route tests/development need a mocked verification response or a development secret setup.
- The protected-route middleware is exported as `requireAuth`; future Worker modules should apply it to their Hono route groups.
