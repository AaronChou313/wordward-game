# Architecture reference

- `index.html`: canvas host and public browser metadata.
- `src/main.js`: application composition and initial scene selection.
- `src/core/`: input, scene manager, loop, audio, storage, assets.
- `src/battle/`: battle scene, units, grid/path, merge, scoring, waves, effects.
- `src/meta/`: account/profile/home/shop/inventory/gacha/equipment/save-data scenes.
- `src/net/`: API client, session state, cloud-save sync, merit queue, Turnstile client.
- `src/config/`: declarative balance, maps, waves, units, items, equipment, difficulty.
- `src/ui/`: reusable canvas controls and notifications.
- `worker/`: Hono Worker API, middleware, security, D1-backed modules.
- `migrations/`: forward-compatible D1 migrations.
- `wrangler.jsonc`: public environment configuration and bindings.
- `scripts/`: release and smoke checks.

Keep responsibilities local. Avoid unrelated refactors. When a large scene needs reusable pure behavior, extract a small adjacent helper that can be unit tested.

