#!/bin/sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
directory="backups/$timestamp"
mkdir -p "$directory"
docker compose exec -T postgres pg_dump -U contract -d marriage_contract -Fc > "$directory/database.dump"
tar -czf "$directory/storage.tar.gz" storage
echo "Backup written to $directory"