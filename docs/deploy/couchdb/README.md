# Servidor de sincronización de InkNote

Este kit instala CouchDB 3.5 en Docker con su propio proyecto, red y volumen. No
modifica los contenedores que ya funcionan en el servidor.

## Requisitos

- Docker con Docker Compose v2.
- Un subdominio, por ejemplo `sync.tudominio.com`, con un registro DNS `A` hacia el servidor.
- HTTPS. InkNote rechaza las direcciones `http://` que no sean locales.
- Unos 1 GB de memoria libre y espacio para tus notas e imágenes.

## 1. Copiar el kit

Desde la raíz del proyecto, en tu equipo:

```bash
scp -r docs/deploy/couchdb usuario@servidor:~/inknote-sync
```

## 2. Revisar el servidor

Este script solo lee información y no cambia nada:

```bash
cd ~/inknote-sync && ./preflight.sh
```

El puerto 5984 debe estar libre. Si no lo está, cambia `COUCHDB_PORT` en `.env.example`.

## 3. Configurar el dominio

Sustituye `sync.tudominio.com` por tu subdominio:

```bash
sed -i 's/sync.example.com/sync.tudominio.com/' .env.example
```

## 4. Instalar

```bash
./setup.sh
```

El script crea `.env` con contraseñas aleatorias, levanta CouchDB y prepara un usuario
limitado a la base `inknote`. Se puede ejecutar de nuevo sin perder datos.

## 5. Publicar con HTTPS

Elige una opción según lo que `preflight.sh` muestre en los puertos 80 y 443.

**Los puertos 80 y 443 están libres.** Caddy obtiene el certificado automáticamente:

```bash
docker compose --profile tls up -d
```

**Ya hay un nginx en el servidor.** Adapta `nginx.conf.example`, obtén el certificado del
subdominio y recarga nginx.

**El servidor usa Dokploy.** Antes del paso 4, quita el `#` de `COMPOSE_FILE` en
`.env.example`. Traefik publicará el subdominio y obtendrá el certificado sin abrir puertos.

**Ya hay otro proxy, como Traefik o Caddy.** Dirige el subdominio a `127.0.0.1:5984` y
permite peticiones de hasta 32 MB. Si el proxy corre dentro de Docker, necesita acceso a
ese puerto del servidor o unirse a la red `inknote-sync_inknote-sync` y usar `couchdb:5984`.

No abras el puerto 5984 en el firewall.

## 6. Conectar InkNote

En **Preferencias > Sincronización** escribe:

| Campo            | Valor                                      |
| ---------------- | ------------------------------------------ |
| Dirección        | `https://sync.tudominio.com`               |
| Usuario          | `inknote`                                  |
| Contraseña       | `INKNOTE_SYNC_PASSWORD` del archivo `.env` |
| Base de datos    | `inknote`                                  |
| Frase de cifrado | Una frase que solo conozcas tú             |

Usa **Diagnosticar conexión** antes de conectar. La frase de cifrado no se guarda en el
servidor: si la pierdes, nadie podrá recuperar las notas sincronizadas.

## Mantenimiento

Copia de seguridad, con una breve parada del servicio:

```bash
./backup.sh
```

Actualizar CouchDB dentro de la versión configurada:

```bash
docker compose build --pull couchdb && docker compose up -d --wait couchdb
```

Guarda `.env` en un lugar seguro y no lo subas a ningún repositorio.
