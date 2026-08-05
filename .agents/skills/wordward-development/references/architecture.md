# Architecture reference

- `index.html`: canvas host and public browser metadata.
- `src/main.js`: application composition and initial scene selection.
- `src/core/`: input, scene manager, loop, audio, storage, assets.
- `src/battle/`: battle scene, units, grid/path, merge, scoring, waves, effects.
- `src/meta/`: account/profile/home/shop/inventory/gacha/equipment/help/save-data scenes.
- `src/net/`: API client, session state, cloud-save sync, merit queue, Turnstile client.
- `src/config/`: declarative balance, maps, waves, units, items, equipment, difficulty, economy.
- `src/ui/`: reusable canvas controls and notifications.
- `worker/`: Hono Worker API, middleware, security, D1-backed modules.
- `migrations/`: forward-compatible D1 migrations (0002 adds leaderboard `best_difficulty` / `best_wave`).
- `wrangler.jsonc`: public environment configuration and bindings.
- `scripts/`: release and smoke checks.

Currency (gold 金币 / gems 宝石 / soulJade 魂玉) lives in the save via `src/meta/saveData.js`. Equipment series/bonds/affixes and dynamic unit weapon slots live in `src/config/equipment.js` (player slots 武器/护甲/饰品; unit slots = 5 base units plus unlocked heroes). The gameplay help panel is `src/meta/helpScene.js`.

Keep responsibilities local. Avoid unrelated refactors. When a large scene needs reusable pure behavior, extract a small adjacent helper that can be unit tested.

