#!/usr/bin/env bash
# Solo lee información del servidor. No cambia nada ni muestra variables o secretos.
set -u
echo '== Sistema'; uname -srm
echo '== Docker'; docker --version; docker compose version
echo '== Memoria'; free -h 2>/dev/null | sed -n 1,2p
echo '== Disco'; df -h / | tail -1
echo '== Contenedores'; docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
echo '== Puertos en uso'
for port in 80 443 5984; do
  if ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; then echo "$port: ocupado"; else echo "$port: libre"; fi
done
