# Task 2: Completion and Merit Rules Report

## Files

- Created `src/battle/progression.js` and `src/battle/progression.test.js`.
- Updated `src/config/difficulty.js` and `src/battle/battleScene.js`.

## Interfaces

- `progression.js` exports `isBossWave(wave)`, `isEliteWave(wave)`,
  `meritForBoss(diffId, wave)`, `claimKey(diffId, wave)`, and
  `nextDifficulty(diffId)`.
- It also exports `canUnlockDifficulty(save, diffId)` and
  `claimBossCompletion(save, diffId, wave)` to keep save-state mutation and
  claim-gated unlock decisions deterministic and testable.
- `BattleScene.handleBossDefeated(wave)` is the narrow Boss-only hook for
  Task 4's identified Boss enemies. Normal enemies in wave 30 do not call it.

## TDD Evidence

- RED: `npm test -- src/battle/progression.test.js` initially failed because
  `./progression.js` did not exist.
- GREEN: the focused suite passed 8 tests after the pure progression rules and
  claim mutation were implemented.
- RED: the unlock-eligibility assertion then failed with
  `canUnlockDifficulty is not a function`.
- GREEN: the focused suite passed again after adding claim-based eligibility.

## Integration Decisions

- `DIFF_UNLOCK` now requires an explicit `bossWave: 30` claim; best-wave
  records are retained only for records and settlement.
- Boss claims are keyed as `<difficulty>:<wave>`, award scaled merit only once,
  persist immediately, and display a Toast banner without changing battle
  state. The battle can therefore progress to wave 31 normally.
- The legacy best-wave difficulty and endless-floor unlock paths were removed
  from `gameOver()`.

## Verification

- Focused: `npm test -- src/battle/progression.test.js` — 8/8 tests passed.
- Full: `npm test` — 2 files and 9 tests passed.
- Build: `npm run build` — Vite transformed 41 modules and completed in 305 ms.
- `git diff --check` completed without whitespace errors.

## Commit

`b9bcfd51af9c3b7f373774413d51d5f7b2237798` — `feat: add boss completion and merit progression`

## Concerns

- Boss identity and spawn wiring are intentionally deferred to Task 4. Until
  then, no current enemy invokes `handleBossDefeated`, preventing wave-30
  normal enemies from generating merit.
