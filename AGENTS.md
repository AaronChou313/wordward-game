# Repository Guidelines

## Project Structure & Module Organization

This repository contains a browser-based canvas game built with Vite and plain ES modules. `index.html` hosts the game canvas, and `src/main.js` initializes input, scenes, assets, audio, and the main loop. Keep code grouped by responsibility:

- `src/core/`: engine services such as input, rendering loop, audio, storage, and scene management.
- `src/battle/`: battle entities, grid/path logic, scoring, effects, and the battle scene.
- `src/meta/`: home, shop, inventory, gacha, equipment, save-data, and codex scenes.
- `src/config/`: declarative balance, map, wave, unit, item, and difficulty data.
- `src/ui/`: reusable canvas controls and notifications.
- `dist/`: generated production output; update it with the build command rather than editing it directly.

## Build, Test, and Development Commands

- `npm install`: install the Vite development dependency from `package-lock.json`.
- `npm run dev`: start the local Vite server with hot reload.
- `npm run build`: create the ES2018 production bundle in `dist/`.
- `npm run preview`: serve the production bundle locally for final verification.
- `npm test`: run the frontend Vitest suite (`vitest run src`).
- `npm run worker:test`: run the Worker Vitest suite (`vitest run worker`).
- `npm run verify:worker`: full pre-merge gate — frontend tests, Worker tests, build, and a dry-run Worker deploy.

Run commands from the repository root. Before submitting a change, ensure `npm run verify:worker` (or at minimum `npm run build`) completes without errors.

## Coding Style & Naming Conventions

Use modern JavaScript modules, two-space indentation, semicolons, and single-quoted strings. Follow existing naming: `PascalCase` for classes (`BattleScene`), `camelCase` for functions and variables (`setupInput`), and descriptive lowercase or camelCase filenames (`storage.js`, `heroGroup.js`). Keep scene lifecycle methods consistent with `enter`, `exit`, `update`, `render`, and pointer handlers. Put tunable gameplay values in `src/config/` instead of scattering constants through scene code. No formatter or linter is configured, so match neighboring code closely.

## Testing Guidelines

Tests use Vitest. The frontend suite runs with `npm test` (`vitest run src`) — currently 251 tests across 33 files covering meta scenes, config/balance logic, battle helpers, and UI controls. The Worker suite runs with `npm run worker:test` (`vitest run worker`) — currently 54 tests across 8 files covering the Hono API, D1-backed modules, auth, merit, and leaderboard behavior. Place tests beside the module as `*.test.js`. Prefer real behavior over implementation-detail mocks.

The full pre-merge gate is `npm run verify:worker` (frontend tests + Worker tests + production build + dry-run Worker deploy). Also smoke-test the result with `npm run preview`, and manually exercise affected scene transitions, pointer interactions, battle behavior, audio, and persisted save data.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects such as `Fix enemy slow timing`, and keep each commit focused. Pull requests should explain the user-visible change, list verification steps, and link related issues. Include screenshots or a short recording for canvas, layout, animation, or other visual changes; call out save-data or balance changes explicitly.

Branches flow `feature` → `preview` → `main`. Start feature branches from current `preview`, merge into `preview`, and later promote `preview` to `main` with explicit user authorization. Cloudflare auto-deploys `preview` to the preview Worker/D1 and `main` to production on merge. Run `npm run verify:worker` and `git diff --check` before merging into `preview`, and `npx wrangler deploy --dry-run --env production` before merging `preview` into `main`.
