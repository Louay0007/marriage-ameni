#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 backups/<timestamp>" >&2
  exit 1
fi

directory="$1"
test -f "$directory/database.dump"
test -f "$directory/storage.tar.gz"
docker compose exec -T postgres pg_restore -U contract -d marriage_contract --clean --if-exists < "$directory/database.dump"
tar -xzf "$directory/storage.tar.gz"
echo "Restore completed from $directory"