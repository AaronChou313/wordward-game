# Task 3 Report: Worker security primitives

## Status

Implemented and verified. Commit: `feat: add Worker security primitives`.

## Files

- Added Worker-safe encoding, HMAC, PBKDF2 password, HS256 JWT, cookie, and Turnstile helpers under `worker/security/`.
- Added same-origin and Cloudflare Rate Limit guards under `worker/middleware/`.
- Added `worker/security/security.test.js` covering validation, crypto, JWT rejection cases, cookies, origin checks, Turnstile outcomes, and limits.
- Added the `worker:test` package script used by the requested command.

## Verification

`npm run worker:test -- worker/security/security.test.js`

```text
Test Files  3 passed (3)
Tests       17 passed (17)
```

`git diff --check` passed. Production security modules contain no `node:` imports, `process`, or `Buffer` dependencies; crypto uses Web Crypto APIs only.

## Concerns

- Hashing and signing helpers are asynchronous because Workers expose cryptography through `crypto.subtle`; callers must await `hashPassword`, `hashRefreshToken`, `hashCursor`, and `signAccessToken`.
- Turnstile upstream non-2xx/network failures are reported as `unavailable`; a valid upstream response with `success: false` is `invalid`.

## Follow-up security fixes

Review follow-up hardening is complete. Password records now require exactly 16 decoded salt bytes and 32 decoded hash bytes, bounded finite integer iterations, and a supported KDF version when present. `hashPassword` applies the same iteration bound and rejects explicitly supplied zero, `NaN`, non-integers, and out-of-range values. Unsafe `/api/*` requests fail closed with `403` when `APP_ORIGIN` is missing or malformed; safe methods remain allowed. Rate-limit bindings remain optional, but a configured binding is allowed only when it explicitly returns `{ success: true }`; malformed results and binding errors fail closed.

Focused regression coverage was added to `worker/security/security.test.js`.

Verification:

```text
npm run worker:test -- worker/security/security.test.js
Test Files  3 passed (3)
Tests       19 passed (19)

npm run build
vite build succeeded
```
