#!/usr/bin/env bash
# Crea o actualiza el servicio. Se puede ejecutar de nuevo sin perder datos.
set -euo pipefail
cd "$(dirname "$0")"

secret() { openssl rand -hex 24; }
if [[ ! -f .env ]]; then
  umask 077
  sed \
    -e "s/^COUCHDB_ADMIN_PASSWORD=.*/COUCHDB_ADMIN_PASSWORD=$(secret)/" \
    -e "s/^COUCHDB_SECRET=.*/COUCHDB_SECRET=$(secret)/" \
    -e "s/^INKNOTE_SYNC_PASSWORD=.*/INKNOTE_SYNC_PASSWORD=$(secret)/" \
    .env.example > .env
  echo 'Se creó .env con contraseñas aleatorias.'
fi
chmod 600 .env
set -a; source ./.env; set +a

docker compose up -d --build --wait couchdb

# Las credenciales entran por stdin para no aparecer en la lista de procesos.
couch() {
  local method="$1" path="$2" body="${3:-}"
  printf 'user = "%s:%s"\n' "$COUCHDB_ADMIN_USER" "$COUCHDB_ADMIN_PASSWORD" |
    docker compose exec -T couchdb curl -sS -o /dev/null -w '%{http_code}' \
      --config - -X "$method" -H 'Content-Type: application/json' \
      ${body:+--data "$body"} "http://127.0.0.1:5984$path"
}
expect() {
  local label="$1" code="$2"; shift 2
  [[ " $* " == *" $code "* ]] || { echo "Error en $label: HTTP $code" >&2; exit 1; }
}

expect 'la base _users' "$(couch PUT /_users)" 201 412
expect 'la base _replicator' "$(couch PUT /_replicator)" 201 412
user="{\"name\":\"$INKNOTE_SYNC_USER\",\"password\":\"$INKNOTE_SYNC_PASSWORD\",\"roles\":[],\"type\":\"user\"}"
expect 'el usuario' "$(couch PUT "/_users/org.couchdb.user:$INKNOTE_SYNC_USER" "$user")" 201 409
expect 'la base de notas' "$(couch PUT "/$INKNOTE_SYNC_DATABASE")" 201 412
security="{\"admins\":{\"names\":[],\"roles\":[]},\"members\":{\"names\":[\"$INKNOTE_SYNC_USER\"],\"roles\":[]}}"
expect 'los permisos' "$(couch PUT "/$INKNOTE_SYNC_DATABASE/_security" "$security")" 200

echo
echo 'CouchDB está listo. Datos para InkNote > Preferencias > Sincronización:'
echo "  Dirección:     https://$INKNOTE_SYNC_DOMAIN"
echo "  Usuario:       $INKNOTE_SYNC_USER"
echo "  Base de datos: $INKNOTE_SYNC_DATABASE"
echo '  Contraseña:    el valor INKNOTE_SYNC_PASSWORD del archivo .env'
