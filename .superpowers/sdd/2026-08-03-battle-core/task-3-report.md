# Task 3 Report: Finite Advanced-Character Pool and Camp

## Files and interfaces

- Added `src/battle/charPool.js`, exporting `createCharPool(unlockedChars)` with `draw(random)`, `remaining(char)`, `remainingTotal()`, and `snapshot()`.
- Added `src/battle/charPool.test.js` for allocation quantity, cap, deterministic decrement, and exhaustion behavior.
- Added `src/battle/refreshBar.test.js` for the exhausted-pool base-draw fallback.
- Updated `src/battle/refreshBar.js`: `RefreshBar(unlockedChars, diff, charPool = null, random = Math.random)` consumes the supplied finite pool and uses injected randomness for advanced rolls, weighted base rolls, and shovel rolls. Existing two-argument callers remain supported.
- Updated `src/battle/battleScene.js`: creates one pool per battle before initial fill, passes it to the refresh bar, and adds a `军营` modal with remaining/initial counts and total remaining.

## Red-green evidence

1. `charPool.test.js` was added before `charPool.js`; the focused test failed because `./charPool.js` did not exist. After implementation, all three pool tests passed.
2. The refresh fallback test was added before updating `RefreshBar`; it failed with advanced `赵` where the expected result was base `兵`. After pool injection and fallback implementation, it passed.

## Pool and cap decisions

- Prefix characters receive three copies; characters from a two-character hero receive two unless they are prefixes; three-character-only hero characters receive one.
- The pool accepts only known unlocked advanced characters and preserves first-seen unlock order. A duplicate unlock does not add inventory.
- The 28-copy cap admits only full character allocations. Any later allocation that would exceed the cap is excluded rather than truncated.
- Advanced copies are removed as soon as a refresh slot appears, including `initialFill`; moving, merging, discarding, or forming a hero never calls a refund operation.
- An advanced success with no remaining copy uses the normal weighted base selection, whose supply remains unlimited.

## UI behavior

- The battle controls include `军营`. Opening it clears drag/selection, blocks pointer interaction behind the modal, and pauses battle updates without ending the battle.
- The modal lists every unlocked known advanced character in stable unlock order. Characters excluded by the cap display `0 / 0`; included entries show live `remaining / initial`, plus the total remaining count.
- `继续战斗` closes the modal and resumes the prior battle state.

## Verification output

Focused tests:

```
Test Files  2 passed (2)
Tests  4 passed (4)
```

Full tests:

```
Test Files  4 passed (4)
Tests  13 passed (13)
```

Build:

```
vite v5.4.21 building for production...
✓ 42 modules transformed.
dist/index.html                 0.62 kB │ gzip:  0.41 kB
dist/assets/index-CPmJGFj4.js  66.36 kB │ gzip: 22.65 kB
✓ built in 318ms
```

## Commit and concerns

- Commit: `cf033eb` (`feat: add finite character pool and camp view`).
- Concerns: no automated canvas interaction harness exists, so camp-modal layout and pointer gating were code-reviewed and build-verified rather than browser-smoke-tested.
