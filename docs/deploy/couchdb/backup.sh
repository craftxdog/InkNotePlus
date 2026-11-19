#!/usr/bin/env bash
# Guarda una copia de los datos. Las notas siguen cifradas dentro de la copia.
set -euo pipefail
cd "$(dirname "$0")"
target="${1:-backups}"
mkdir -p "$target"
file="inknote-couchdb-$(date +%Y%m%d-%H%M%S).tar.gz"
docker compose stop couchdb
trap 'docker compose start couchdb' EXIT
docker run --rm -v inknote-sync_couchdb-data:/data:ro -v "$(cd "$target" && pwd)":/backup \
  alpine:3 tar czf "/backup/$file" -C /data .
echo "Copia creada: $target/$file"
