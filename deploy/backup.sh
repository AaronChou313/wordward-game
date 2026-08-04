#!/bin/sh
set -eu

BACKUP_DIR=${BACKUP_DIR:-/srv/wordward-backups}
BACKUP_PREFIX=${BACKUP_PREFIX:-wordward}
RETENTION_DAYS=${RETENTION_DAYS:-14}

case "$BACKUP_PREFIX" in
  *[!a-zA-Z0-9_-]*|'')
    echo 'BACKUP_PREFIX must contain only letters, numbers, underscores, or hyphens' >&2
    exit 1
    ;;
esac

timestamp=$(date +%F-%H%M%S)
final_path="$BACKUP_DIR/$BACKUP_PREFIX-$timestamp.dump"
partial_path="$final_path.partial"

cleanup() {
  if [ -f "$partial_path" ]; then
    rm -f -- "$partial_path"
  fi
}
trap cleanup EXIT HUP INT TERM

install -d -m 700 "$BACKUP_DIR"
umask 077

docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$partial_path"
test -s "$partial_path"
docker compose exec -T db sh -c 'pg_restore --list' \
  < "$partial_path" > /dev/null
mv "$partial_path" "$final_path"
trap - EXIT HUP INT TERM

find "$BACKUP_DIR" -type f -name "$BACKUP_PREFIX-*.dump" \
  -mtime "+$RETENTION_DAYS" -delete
printf '%s\n' "$final_path"
