# Arquitectura de InkNote

**Estado:** fundación local-first  
**Última revisión:** 2026-11-03

Este es el único documento vivo de arquitectura. No se crean planes ni
especificaciones Markdown en la raíz.

## Alcance actual

InkNote es una aplicación de escritorio local-first para notas Markdown. Esta
entrega prepara datos, sincronización, módulos, seguridad y distribución. El
renderer es un lienzo vacío a propósito: no hay editor, sidebar, preview,
componentes visuales ni recursos gráficos.

La referencia arquitectónica es Inkdrop, no una copia de su API:

- La base local es fuente de verdad. Una escritura local se confirma antes de
  entrar en sincronización.
- El flujo es unidireccional: comando, caso de uso, base local, evento y
  proyección de estado.
- Los comandos, la configuración y los módulos tienen contratos y lifecycle
  explícitos.
- Las extensiones futuras reciben capacidades limitadas; no reciben Electron,
  Node, SQLite, red ni secretos directamente.

Zustand sustituye Redux por decisión del proyecto. Mantiene el flujo Flux de
Inkdrop sin añadir React ni un store global expuesto a extensiones.

## Lo que existe

```text
src/
  main.ts                         composición de módulos de confianza
  main/                           CSP, IPC, rutas de datos, opciones de ventana
  preload/                        bridge InkNoteApi mínimo y validado
  renderer.ts                     bootstrap vacío del lienzo
  renderer/
    commands/                     acciones de renderer para futura UI
    state/                        proyecciones Zustand, no fuente de verdad
  domain/                         notas, repositorios y contrato de sync
  application/                    comandos, configuración y lifecycle de módulos
  infrastructure/
    sqlite/                       DB, migraciones, FTS, revisiones y outbox
    config/                       persistencia JSON atómica de configuración
  shared/                         contratos IPC y manifiestos declarativos
tests/
  unit/                           contratos, seguridad, módulos y configuración
  integration/                    SQLite, outbox y almacenamiento JSON
```

Dependencias de producción: Electron, Zod y Zustand. SQLite viene de Node
mediante node:sqlite. No hay React, React DOM, CodeMirror, preview Markdown,
renderer de HTML, cliente HTTP, SDK cloud ni driver SQLite nativo externo.

## Flujo canónico

```text
Atajo, menú o UI futura
  -> comando de renderer
  -> InkNoteApi del preload
  -> IPC con emisor, entrada y salida validados
  -> CommandRegistry con nombre namespace:action
  -> transacción SQLite en proceso principal
       nota + revisión + operación outbox
  -> evento notes:changed confirmado
  -> proyección Zustand
  -> UI futura
```

SQLite no sale del proceso principal. Zustand sólo proyecta resultados
confirmados y estado transitorio; nunca escribe SQLite ni inicia sync.

## Base de datos local

- Archivo nuevo: inknote-v2.sqlite dentro de userData.
- No se abre, borra ni migra una base anterior llamada inknote.sqlite.
- Migraciones versionadas e idempotentes.
- Notas Markdown con UUID, timestamps, revisión, papelera y revisiones
  históricas.
- FTS5 para búsqueda local.
- SQL parametrizado; límites de resultados acotados.

Cada mutación de una nota ocurre en una transacción inmediata. Si falla la
revisión o la operación de sync, la nota también revierte.

## Sincronización

La infraestructura de sync está preparada, pero no se declara un proveedor
remoto activo.

- sync_outbox guarda operaciones locales ordenadas por dispositivo.
- Cada dispositivo tiene una identidad local y secuencia monotónica.
- Upserts guardan el documento vigente; la papelera genera tombstones.
- Checkpoints por destino permiten reanudar push y pull.
- SyncAdapter define el puerto de transporte sin acoplar HTTP, cloud o cuenta.
- No hay URL remota, credencial, tráfico de red, scheduler, pull remoto ni
  resolución de conflictos habilitados aún.

Antes de activar un proveedor se requiere una decisión explícita: protocolo,
política de conflictos, HTTPS, autenticación, almacenamiento de secretos en el
keychain del sistema, límites de reintento y pruebas de recuperación. Las
credenciales nunca se guardarán en SQLite ni en config.json.

## Configuración

La configuración sigue la idea de Inkdrop: claves por namespace, esquema,
valor por defecto, lectura, escritura y observación de cambios.

- Archivo: config.json en userData; se crea al primer cambio.
- Configuración no válida o malformada no obtiene privilegios: usa defaults.
- Cada definición pasa por Zod. Las claves ajenas, prototype y constructor no
  entran en el registro.
- La escritura usa archivo temporal, rename atómico y permisos de usuario.
- Configuración de módulos actuales:
  - core.window.initialWidth: 1280
  - core.window.initialHeight: 800
  - core.window.minimumWidth: 640
  - core.window.minimumHeight: 480

La ventana es redimensionable. Las dimensiones iniciales nunca bajan de sus
mínimos. El lienzo llena ancho y alto disponibles con CSS lógico, sin layout
visual adicional.

## Módulos y extensiones

ModuleRegistry registra módulos de confianza antes del arranque, los activa en
orden y los desactiva en orden inverso. Si falla una activación, limpia los
módulos ya activos.

Módulos actuales:

- core.config: carga definiciones tipadas y config.json.
- core.notes: abre SQLite, crea comandos, outbox e IPC de notas.

El manifiesto de extensión sólo es un contrato declarativo. Valida versión de
API, IDs con namespace, capacidades y contribuciones. No existe cargador,
marketplace ni ejecución de código de terceros. Eso es intencional: un plugin
futuro necesitará activate/deactivate, Disposable, capacidades mínimas y un
entorno limitado; no acceso directo a la DB ni a Electron.

## Seguridad

- contextIsolation, sandbox, webSecurity y nodeIntegration: false.
- No webviews, navegación ni ventanas emergentes.
- Permisos Electron denegados por defecto.
- Preload con bridge estrecho; IPC valida emisor y mainFrame.
- CSP de producción y desarrollo usa script-src 'self'. No se permiten scripts
  inline.
- Desarrollo permite sólo conexiones Vite locales y estilos inline necesarios
  para HMR. Producción no los permite.
- Fuses desactivan RunAsNode, NODE_OPTIONS e inspect arguments; ASAR tiene
  validación de integridad.
- Notas, rutas y SQL no se mandan a telemetría, APIs ni servicios externos.

No se afirma cifrado extremo a extremo, firma de artefactos, autenticación ni
sincronización remota hasta que existan claves, recuperación y pruebas reales.

## Distribución

Electron Forge empaqueta la aplicación. Los makers de Forge generan Windows y
Linux; macOS empaqueta la app con Forge y crea un DMG UDZO con la herramienta
nativa `hdiutil`, sin un maker de imagen, layout visual ni parser extra.

| Plataforma | Arquitectura | Formato            | Script                  |
| ---------- | ------------ | ------------------ | ----------------------- |
| macOS      | arm64        | DMG                | pnpm run make:mac:arm64 |
| macOS      | x64          | DMG                | pnpm run make:mac:x64   |
| Windows    | x64          | Squirrel Setup.exe | pnpm run make:win:x64   |
| Linux      | x64          | DEB y RPM          | pnpm run make:linux:x64 |

El workflow de calidad corre en PR y main. Valida lockfile, audit de
high/critical, lint, tipos, tests y package. El workflow de instaladores sólo
corre manualmente o en tags v*, y también ejecuta audit, lint, tipos y tests
antes de usar builders nativos para ARM macOS, Intel macOS, Windows y Linux.
Las acciones de GitHub están fijadas a commits.

Los artefactos son construibles, no firmados ni notarizados. Gatekeeper y
SmartScreen pueden advertir al usuario hasta que se aporten certificados y se
autorice configurar firma y notarización.

## Comandos

```sh
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run verify
pnpm run build
pnpm run make:mac:arm64
pnpm run make:mac:x64
pnpm run make:win:x64
pnpm run make:linux:x64
```

pnpm se fija en 11.25.0. La instalación usa el lockfile y permite únicamente
los builds revisados de Electron y electron-winstaller necesarios para el
empaquetado.

La auditoría del 2026-11-03 no tiene vulnerabilidades high ni critical. Tiene
dos moderadas transitivas (`glob` y `minimatch`) dentro de herramientas de
empaquetado de Electron Forge, no en el runtime distribuido. El gate bloquea
high/critical; estas dos se revisan antes de cada actualización de Forge o
release público y no se fuerzan con overrides incompatibles.

## Límites de la siguiente entrega

No añadir UI hasta que se solicite. El siguiente slice de datos puede añadir
notebooks, tags y archivos como entidades locales; el siguiente slice de sync
puede añadir un adaptador remoto sólo con contrato y autorización claros.

## Fuentes

- Inkdrop, [base local y flujo de sync](https://developers.inkdrop.app/guides/access-the-local-database), [Flux](https://developers.inkdrop.app/guides/flux-architecture), [configuración](https://developers.inkdrop.app/modules/config), [comandos](https://developers.inkdrop.app/modules/command-registry), [Environment](https://developers.inkdrop.app/modules/environment) y [lifecycle de paquetes](https://developers.inkdrop.app/modules/package-manager).
- Inkdrop, [formatos y arquitecturas de instalación](https://docs.inkdrop.app/start-guide).
- API docs de Inkdrop: [flujo Flux fuente](https://github.com/inkdropapp/api-docs/blob/2f7bae8a656b439c6226ed060de89e9cf76c18aa/src/app/guides/flux-architecture/page.mdx) y [base local fuente](https://github.com/inkdropapp/api-docs/blob/2f7bae8a656b439c6226ed060de89e9cf76c18aa/src/app/guides/access-the-local-database/page.mdx).
- Electron, [seguridad](https://www.electronjs.org/docs/latest/tutorial/security/).
- Electron Forge, [CLI](https://www.electronforge.io/cli), [Squirrel.Windows](https://www.electronforge.io/config/makers/squirrel.windows), [DEB](https://www.electronforge.io/config/makers/deb) y [RPM](https://www.electronforge.io/config/makers/rpm).
- npm audit, [advisory de minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) y [advisory de glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
