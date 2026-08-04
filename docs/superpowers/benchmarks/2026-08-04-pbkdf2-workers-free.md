# PBKDF2 preview benchmark gate (manual)

The approved fast path does not add a public benchmark endpoint. This keeps the attack surface small and avoids shipping a benchmark route by accident. Before changing `PASSWORD_KDF_ITERATIONS` in production, deploy the current Worker to the isolated preview environment and measure real login requests with Cloudflare Workers CPU metrics.

Test candidates `1000, 2000, 4000, 8000, 12000, 24000, 48000, 96000, 120000` after one cold request is discarded. Record p50/p95 Worker CPU, request count, and Error 1102/1027 observations. Select the highest candidate with p95 CPU <= 8 ms and no sustained limit errors. If no candidate passes, stop the release and revisit the approved hosting/KDF constraints; do not weaken password hashing to make the gate pass.

Record only aggregate measurements and the selected value here. Never record passwords, hashes, salts, tokens, or user identifiers. The default remains configurable through the non-secret `PASSWORD_KDF_ITERATIONS` Worker variable and is currently `120000` pending this preview gate.
