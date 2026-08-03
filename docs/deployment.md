# Production Deployment

The production stack runs PostgreSQL 16, the Node.js 22 API, and an unprivileged Nginx container serving the Vite bundle and proxying `/api`. The Compose port binds to loopback by default so the host's TLS reverse proxy remains the only public entry point.

## DNS and TLS

1. Point the chosen game hostname's `A`/`AAAA` record at the server and wait for it to resolve.
2. Keep `HTTP_BIND=127.0.0.1` and select an unused `HTTP_PORT` in the deployment `.env`.
3. Configure the host Nginx, Caddy, or equivalent TLS terminator to proxy that hostname to `http://127.0.0.1:HTTP_PORT`. Forward `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`.
4. Obtain and automatically renew a trusted certificate (for example with Certbot or Caddy), then redirect public HTTP to HTTPS. Do not expose the Compose database or API ports.

The application Nginx adds CSP, frame, MIME-sniffing, referrer, and permissions headers. Verify the final public response also has HSTS after TLS is active; HSTS belongs at the public TLS terminator.

## Environment variables

Copy `.env.example` to an untracked `.env`, replace every placeholder, and restrict it to the deployment account (`chmod 600 .env`). Generate `JWT_ACCESS_SECRET` and `REFRESH_TOKEN_PEPPER` independently with at least 32 random characters. Use a different random PostgreSQL password and URL-encode it inside `DATABASE_URL`.

Required variables are `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `REFRESH_TOKEN_PEPPER`. Optional values are `POSTGRES_DB`, `POSTGRES_USER`, `HTTP_BIND`, and `HTTP_PORT`. Never commit `.env`, backups, certificates, or printed secret values.

Validate interpolation without starting services:

```bash
docker compose --env-file .env config --quiet
```

## Migrations

The API container runs `npm run prisma:migrate:deploy` before every start and only starts after PostgreSQL is healthy. Review migration SQL before release, take a backup, then deploy with:

```bash
docker compose build web
docker compose build api
docker compose up -d
docker compose ps
curl --fail "http://$(docker compose port web 8080)/api/health"
```

Schema changes must be committed under `server/prisma/migrations/`; never use `prisma db push` in production.

Run `deploy/smoke.sh` only against a disposable verification database because it intentionally creates a temporary account, save, and merit record. The script uses authenticated `/api/leaderboard/me`, so it remains valid even when more than ten leaderboard rows exist.

## Daily backups

Create a root-owned or deployment-user cron job that writes outside the repository and retains encrypted/off-host copies. A minimal daily command is:

```bash
cd /opt/wordward
umask 077
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "/srv/wordward-backups/wordward-$(date +%F).dump"
find /srv/wordward-backups -type f -name 'wordward-*.dump' -mtime +14 -delete
```

Monitor the cron exit status and backup size. Copy backups to separate storage; a volume on the same server is not disaster recovery.

## Restore drill

Test restores against a disposable database, never over production:

```bash
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" wordward_restore_test'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d wordward_restore_test --clean --if-exists' < /srv/wordward-backups/WORDWARD_BACKUP.dump
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d wordward_restore_test -c "SELECT count(*) FROM users;"'
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" wordward_restore_test'
```

Record the tested backup name, timestamp, row-count sanity checks, and restore duration in the deployment log.

## Log rotation

Compose configures Docker's `local` logging driver with a 10 MiB, five-file cap for every service. Review `docker compose logs --since 24h api web db` for crashes, migration failures, authentication spikes, and backup errors. Do not log authorization headers, cookies, database URLs, or request bodies containing saves/passwords.

## Rollback

Before deployment, record the current Git commit and image IDs and take a verified database backup. To roll back application code:

```bash
git switch --detach PREVIOUS_COMMIT
docker compose build web
docker compose build api
docker compose up -d --no-deps api web
curl --fail "http://$(docker compose port web 8080)/api/health"
```

Prefer forward-compatible migrations. If a schema rollback is unavoidable, stop writes, archive the failed database, restore the pre-deploy dump, then start the previous images. Never run destructive reverse SQL without a tested backup. Return the checkout to `feature/gameplay-overhaul` after the incident is resolved.
