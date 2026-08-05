# Mobile Login Input Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent mobile soft-keyboard viewport changes from moving the canvas and allow non-empty passwords from 1 to 128 characters.

**Architecture:** `canvasTextInput.js` owns a small observable active-input state. `setupInput` freezes its last canvas layout while that state is active and recomputes once input ends. Password validation remains duplicated at the UI boundary and authoritative Worker boundary, with matching limits and tests.

**Tech Stack:** Plain JavaScript ES modules, Vitest, Canvas/Vite, Cloudflare Workers Web Crypto.

## Global Constraints

- Passwords must contain 1–128 Unicode characters; empty and 129-character passwords are rejected.
- Do not change PBKDF2 configuration, D1 schema, tokens, Turnstile, or origin checks.
- Preserve the 750×1334 design coordinate system.
- Follow `AGENTS.md` and the project `wordward-development` skill.

---

### Task 1: Freeze canvas layout while native text input is active

**Files:**
- Modify: `src/ui/canvasTextInput.js`
- Modify: `src/core/input.js`
- Create: `src/ui/canvasTextInput.test.js`
- Create: `src/core/input.test.js`

**Interfaces:**
- Produces: `isCanvasTextInputActive(): boolean`
- Produces: `subscribeCanvasTextInputState(listener): () => void`
- Consumes: active-state notifications in `setupInput`

- [ ] Write tests proving focus marks input active, uses a top-safe fixed input, blur clears activity, and resize is ignored only while active.
- [ ] Run the tests and confirm failures identify missing activity/layout behavior.
- [ ] Implement observable input state, scroll restoration, top-safe input style, and frozen resize behavior.
- [ ] Run the targeted tests and confirm they pass.

### Task 2: Change password limits to 1–128 everywhere

**Files:**
- Modify: `src/meta/accountScene.js`
- Modify: `worker/security/password.js`
- Create: `src/meta/accountScene.test.js`
- Modify: `worker/security/security.test.js`

**Interfaces:**
- UI submission: reject length 0 and >128 before API calls.
- Worker `validateCredentials`: accept length 1–128 and reject all other lengths.

- [ ] Write tests proving one-character passwords pass and empty/129-character passwords fail.
- [ ] Run the tests and confirm they fail under the current 10-character minimum.
- [ ] Implement matching UI and Worker validation.
- [ ] Run targeted frontend and Worker tests.

### Task 3: Verify and release feature branch

**Files:**
- Verify all changed files.

- [ ] Run `npm run verify:worker`.
- [ ] Run `npx wrangler deploy --dry-run --env production`.
- [ ] Run `git diff --check`.
- [ ] Perform a mobile-sized browser check of login input layout.
- [ ] Commit and push the current feature branch for merging into `preview`.

