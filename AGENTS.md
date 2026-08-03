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

Run commands from the repository root. Before submitting a change, ensure `npm run build` completes without errors.

## Coding Style & Naming Conventions

Use modern JavaScript modules, two-space indentation, semicolons, and single-quoted strings. Follow existing naming: `PascalCase` for classes (`BattleScene`), `camelCase` for functions and variables (`setupInput`), and descriptive lowercase or camelCase filenames (`storage.js`, `heroGroup.js`). Keep scene lifecycle methods consistent with `enter`, `exit`, `update`, `render`, and pointer handlers. Put tunable gameplay values in `src/config/` instead of scattering constants through scene code. No formatter or linter is configured, so match neighboring code closely.

## Testing Guidelines

There is currently no automated test framework or coverage threshold. Test changes manually through `npm run dev`, including affected scene transitions, pointer interactions, battle behavior, audio, and persisted save data. Also run `npm run build` and smoke-test the result with `npm run preview`. If adding tests, place them beside the module as `*.test.js` or introduce a documented `tests/` directory and add the command to `package.json`.

## Commit & Pull Request Guidelines

Git history is not available in this checkout. Use short, imperative commit subjects such as `Fix enemy slow timing`, and keep each commit focused. Pull requests should explain the user-visible change, list verification steps, and link related issues. Include screenshots or a short recording for canvas, layout, animation, or other visual changes; call out save-data or balance changes explicitly.
