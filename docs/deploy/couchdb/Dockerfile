ARG COUCHDB_VERSION=3.5
FROM couchdb:${COUCHDB_VERSION}

# El arranque de la imagen cambia permisos en etc, así que el ajuste va dentro de ella.
COPY --chown=couchdb:couchdb inknote.ini /opt/couchdb/etc/default.d/20-inknote.ini
