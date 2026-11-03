# Arquitectura de InkNote

**Estado:** fundación local-first  
**Última revisión:** 2026-11-03

Este es el único documento vivo de arquitectura. No se crean planes ni
especificaciones Markdown en la raíz.

## Alcance actual

InkNote es una aplicación de escritorio local-first para notas Markdown. Esta
entrega conecta datos, infraestructura de sincronización, módulos, seguridad,
distribución y un shell React con biblioteca, lista de notas, editor CodeMirror
6 y preview Markdown. Una selección de tema controla UI, sintaxis y preview.

La referencia arquitectónica es Inkdrop, no una copia de su API:

- La base local es fuente de verdad. Una escritura local se confirma antes de
  entrar en sincronización.
- El flujo es unidireccional: comando, caso de uso, base local, evento y
  proyección de estado.
- Los comandos, la configuración y los módulos tienen contratos y lifecycle
  explícitos.
- Las extensiones futuras reciben capacidades limitadas; no reciben Electron,
  Node, SQLite, red ni secretos directamente.

React y TypeScript/TSX construyen la interfaz. Zustand gestiona el estado
compartido mediante acciones explícitas y selectores. El flujo conserva los
principios unidireccionales de Flux, sin Dispatcher personalizado. Inkdrop
documenta React con Redux; React con Zustand es una decisión propia de InkNote.

## Lo que existe

```text
src/
  main.ts                         composición de módulos de confianza
  main/                           CSP, IPC, rutas de datos, opciones de ventana
  preload/                        bridge InkNoteApi mínimo y validado
  renderer.tsx                    createRoot y composición React
  renderer/
    app.tsx                       lifecycle React y conexión al bridge
    components/                   componentes TSX de sidebar, lista y editor
    editor/                       CodeMirror 6, formato y preview seguro
    themes/                       catálogo validado y hojas externas de tema
    layout/                       contrato main:full/slim/distraction-free
    state/                        store Zustand, acciones y proyecciones tipadas
  domain/                         notas, repositorios y contrato de sync
  application/                    comandos, configuración y lifecycle de módulos
  infrastructure/
    sqlite/                       DB, migraciones, FTS, revisiones y outbox
    config/                       persistencia JSON atómica de configuración
  shared/                         contratos IPC y manifiestos declarativos
tests/
  unit/                           contratos, seguridad, módulos y configuración
  integration/                    SQLite, outbox y almacenamiento JSON
  renderer/                       acciones Zustand y componentes React
themes/
  inknote-light/                  paquete de tema Inkdrop-compatible
  inknote-dark/                   paquete de tema Inkdrop-compatible
```

El runtime incluye React, React DOM, Zustand, Zod, CodeMirror 6,
react-markdown con remark-gfm, iconos SVG de Lucide, electron-squirrel-startup y
los estilos de `@inkdropapp/css` 0.10.4. Electron aporta la plataforma de
escritorio y SQLite viene de Node mediante node:sqlite. Vite, tipos React,
Testing Library y jsdom son herramientas de desarrollo. El helper de temas y
Puppeteer permanecen en los paquetes de desarrollo bajo `themes/`; no entran
al bundle distribuido. No hay cliente HTTP, SDK cloud ni driver SQLite nativo
externo. Los lenguajes adicionales cargados son JavaScript/TypeScript y JSON.

## Flujo canónico

```text
Evento de UI
  -> acción tipada del store Zustand
  -> actualización atómica de estado compartido
  -> selector Zustand
  -> componente React TSX

Mutación persistente
  -> InkNoteApi del preload
  -> IPC con emisor, entrada y salida validados
  -> CommandRegistry con nombre namespace:action
  -> transacción SQLite en proceso principal
       nota + revisión + operación outbox
  -> evento notes:changed confirmado
  -> acción Zustand / proyección confirmada / componente React
```

SQLite no sale del proceso principal. Zustand sólo proyecta resultados
confirmados y estado transitorio; nunca escribe SQLite ni inicia sync. El
renderer no llama a SQLite. Los componentes invocan acciones del store;
la persistencia cruza únicamente el bridge validado.

## Base de datos local

- Archivo nuevo: inknote-v2.sqlite dentro de userData.
- No se abre, borra ni migra una base anterior llamada inknote.sqlite.
- Migraciones versionadas e idempotentes.
- Notas Markdown con UUID, timestamps, revisión, papelera y revisiones
  históricas.
- FTS5 para búsqueda local.
- Migración 3: jerarquía de notebooks y metadata de nota (notebook, estado,
  etiquetas y marca de plantilla), incluida en sus revisiones. Los contadores
  de la biblioteca se calculan en SQLite, sin datos de demostración.
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
- La metadata de notas entra en su outbox. Los notebooks son entidades locales;
  su protocolo de sincronización aún no está implementado.

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
  - core.appearance: tema, anchos de panel, modo del editor y proporción del split.

Las preferencias pasan por un IPC propio validado y persisten en config.json.
Los cambios se ordenan para evitar que una respuesta antigua reemplace la
selección reciente. Un fallo de escritura restaura la última preferencia
confirmada y se informa en Preferencias.

La ventana es redimensionable. Las dimensiones iniciales nunca bajan de sus
mínimos. El `--page-min-width: 320px` de `@inkdropapp/css` queda como límite
CSS de la base; el mínimo nativo de InkNote sigue siendo 640 porque la fuente
de Inkdrop no publica un mínimo de ventana ni una regla de cambio de layout.

## React, Zustand y distribución principal

Cada ventana crea su propio `createWorkspaceStore(api)` con Zustand vanilla.
El store agrupa notas confirmadas, selección, búsqueda, borrador y layout.
Sus acciones actualizan las partes relacionadas en una sola operación; no
existen dependencias `waitFor` ni una segunda capa de dispatch. Un contexto
React inyecta la instancia y `useStore(store, selector)` suscribe cada
componente sólo a los valores que consume. El texto de búsqueda pendiente es
estado local de React, con debounce de 200 ms antes de consultar SQLite.

El lifecycle de `App` conecta eventos IPC y limpia la suscripción al desmontar.
Soporta el montaje y desmontaje adicional de StrictMode. Los identificadores
de petición descartan resultados antiguos de búsquedas; al desconectar se
invalidan las peticiones pendientes. Los guardados conservan texto escrito
mientras la operación está en curso y no reemplazan el documento de otra nota.
Los borradores sin guardar se conservan en memoria al cambiar de selección;
no se promete recuperación de esos borradores después de cerrar la aplicación.

Vite transpila TSX con el runtime JSX automático configurado en TypeScript.
El renderer usa el soporte nativo de Vite, sin el plugin de React Fast Refresh
que inyecta un preámbulo inline. Los cambios de componentes recargan la página
en desarrollo; los estilos usan el HMR de Vite. La política `script-src 'self'`
se conserva tanto en desarrollo como en producción.

`index.html` carga primero `renderer-startup.ts`, un módulo mínimo que importa
`renderer.tsx` de forma asíncrona y captura fallos anteriores al montaje de React.
Esto corrige el montaje vacío reproducido en el arranque frío de Electron con
el entry estático de desarrollo; no se añade una recarga automática ni un retraso.
La CSP de estilos de desarrollo usa `unsafe-inline` para HMR sin mezclar un
nonce, porque esa mezcla hace que el navegador ignore `unsafe-inline`.
Producción conserva exclusivamente el nonce para los estilos de CodeMirror.

`pnpm run test:desktop` arranca Forge y Electron con un perfil temporal, sin
mocks de preload o IPC. Comprueba el primer montaje, CSS aplicado, escritura
SQLite, CodeMirror, preview, preferencias persistidas tras recargar y CSP.
`pnpm run test:desktop:package` comprueba el paquete nativo previamente construido.
El cliente `puppeteer-core` es sólo de desarrollo y usa Electron existente;
no descarga ni distribuye otro navegador. Estas pruebas necesitan un escritorio
gráfico disponible y cierran únicamente sus procesos temporales.

El contrato de layouts conserva los nombres, orden y componentes publicados
por Inkdrop:

| Layout                  | Componentes                                                         | Columnas documentadas |
| ----------------------- | ------------------------------------------------------------------- | --------------------- |
| `main:full`             | `ModalLayout`, `SideBarLayout`, `NoteListBarLayout`, `EditorLayout` | 3                     |
| `main:slim`             | `ModalLayout`, `NoteListBarLayout`, `EditorLayout`                  | 2                     |
| `main:distraction-free` | `ModalLayout`, `EditorLayout`                                       | editor solamente      |

El estado conserva el par publicado por Inkdrop: `sidebarVisible` y
`distractionFreeEnabled`. InkNote añade una política de ajuste basada en el
espacio disponible: oculta primero la biblioteca y después alterna lista y
editor, manteniendo 320 px para el documento. La biblioteca puede abrirse como
panel superpuesto. El editor ofrece modos editar, split y preview, con proporción
ajustable entre 20% y 80%.

`@inkdropapp/css` no publica tamaños de sidebar, lista o editor ni asigna sus
breakpoints a estos modos. Sus únicos límites disponibles para esta base son
`--page-min-width: 320px` y los tokens generales de utilities: mobile 320px,
tablet 768px, computer 992px, monitor grande 1200px y widescreen 1920px. Se
importan como tokens. Los anchos iniciales de 220 px para biblioteca y 300 px
para lista son decisiones de InkNote basadas en las referencias, no medidas
publicadas por Inkdrop. Se ajustan por arrastre o teclado y se persisten.
El header del documento se adapta mediante una container query de 480 px;
también es una regla propia de InkNote.

## Tokens y desarrollo de temas

`src/index.css` consume directamente la fuente MIT `@inkdropapp/css` en el
orden exigido: `layers`, `reset`, `tokens`, `utilities`, `ui`, `status`,
`task-progress`, `tags`, `syntax` y `markdown`. Sus capas preservan la precedencia de Inkdrop.
El shell usa variables semánticas de `ui.css`, incluidas
`--sidebar-*`, `--note-list-bar-*`, `--editor-*`, `--input-*`,
`--button-*`, `--text-color` y `--border-color`. Los temas eligen sus valores
desde las primitivas publicadas por Inkdrop.
Los tokens de estado, progreso y tags quedan disponibles con
`--note-status-*`, `--task-progress-view-*` y `--tag-*`.

Los paquetes `themes/inknote-light` y `themes/inknote-dark` siguen el manifest
de tema unificado de Inkdrop 6: `theme: true`, `themeAppearance`, las tres
hojas `ui.css`, `syntax.css` y `preview.css`, y
`prepublishOnly: generate-palette`. Cada tema define sus overrides en
`theme.ui`, `theme.syntax` y `theme.preview`, sobre las subcapas base oficiales.
El catálogo valida los manifests y carga las tres hojas como recursos CSS
externos de la aplicación. Preferencias cambia el paquete completo; no hay
cargador de temas de terceros ni ejecución de JavaScript de temas. Cada uno tiene su
`palette.json` generado por `@inkdropapp/theme-dev-helpers` 0.7.1.

CodeMirror mapea tags Lezer a las clases públicas `.tok-*`. El preview usa
`.mde-preview-container` y `.mde-preview`, con variables `--mde-preview-*`.
`react-markdown` construye elementos React y omite HTML de notas; GFM añade
tablas, tareas y tachado. Las imágenes externas no se solicitan automáticamente.
Los enlaces HTTP/HTTPS sólo se abren por clic mediante un IPC validado; URLs
con credenciales y otros protocolos se rechazan.

El helper declara su propia línea `@inkdropapp/css` 0.9.x para resolver una
paleta, mientras el renderer consume 0.10.4 directamente. Por eso el
`palette.json` es el artefacto de desarrollo compatible que produce la
herramienta oficial, no una afirmación de identidad byte a byte con los tokens
del shell.

Con Node 24 o superior, los comandos se ejecutan desde el paquete de tema, no
desde la raíz de InkNote:

```sh
cd themes/inknote-light
npx dev-server
npx generate-palette
```

En Windows, la guía oficial de Inkdrop exige WSL para `dev-server`. Puppeteer
permanece aislado en esos paquetes porque lo necesita el generador de paleta;
no forma parte de la aplicación distribuida. `generate-palette` requiere que
Puppeteer tenga un navegador Chromium disponible: la instalación local intenta
obtenerlo, y si esa descarga falla por red se debe instalar o configurar un
ejecutable compatible antes de correr el comando. Los workflows omiten esa
descarga porque no generan paletas.

## Módulos y extensiones

ModuleRegistry registra módulos de confianza antes del arranque, los activa en
orden y los desactiva en orden inverso. Si falla una activación, limpia los
módulos ya activos.

Módulos actuales:

- core.config: carga definiciones tipadas y config.json.
- core.appearance: expone preferencias y nonce de estilos por IPC validado.
- core.links: abre enlaces web permitidos mediante el navegador del sistema.
- core.notes: abre SQLite, crea comandos, outbox e IPC de notas y biblioteca.

El manifiesto de extensión sólo es un contrato declarativo. Valida versión de
API, IDs con namespace, capacidades y contribuciones. No existe cargador,
marketplace ni ejecución de código de terceros. Eso es intencional: un plugin
futuro necesitará activate/deactivate, Disposable, capacidades mínimas y un
entorno limitado; no acceso directo a la DB ni a Electron.

## Seguridad

- contextIsolation, sandbox y webSecurity activados; nodeIntegration desactivado.
- No webviews, navegación ni ventanas emergentes.
- Permisos Electron denegados por defecto.
- Preload con bridge estrecho; IPC valida emisor y mainFrame.
- CSP de producción y desarrollo usa script-src 'self'. No se permiten scripts
  inline.
- Zod se configura con `jitless: true` antes de construir los esquemas; su
  validación no intenta generar código dinámico bajo la CSP.
- Desarrollo permite sólo conexiones Vite locales y estilos inline necesarios
  para HMR. Producción autoriza las hojas de CodeMirror mediante nonce aleatorio,
  sin permitir scripts inline ni estilos arbitrarios globales.
- Fuses desactivan RunAsNode, NODE_OPTIONS e inspect arguments; ASAR tiene
  validación de integridad.
- Notas, rutas y SQL no se mandan a telemetría, APIs ni servicios externos.

No se afirma cifrado extremo a extremo, firma de artefactos, autenticación ni
sincronización remota hasta que existan claves, recuperación y pruebas reales.

## Distribución

Electron Forge empaqueta la aplicación. Los makers de Forge generan Windows y
Linux; macOS empaqueta la app con Forge y crea un DMG UDZO con la herramienta
nativa `hdiutil`, sin un maker de imagen, layout visual ni parser extra.
Forge verifica las descargas y los archivos cacheados con los checksums
oficiales incluidos en la dependencia Electron instalada. La verificación
SHA-256 sigue activa sin exigir una consulta adicional a GitHub para obtener
el archivo de sumas.

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
pnpm run test:desktop
pnpm run build
pnpm run test:desktop:package
pnpm run make:mac:arm64
pnpm run make:mac:x64
pnpm run make:win:x64
pnpm run make:linux:x64

cd themes/inknote-light && npx dev-server
cd themes/inknote-light && npx generate-palette
```

pnpm se fija en 11.25.0. La instalación usa el lockfile y permite únicamente
los builds revisados de Electron, electron-winstaller y Puppeteer. Puppeteer
se aprueba sólo para generar palettes en los paquetes de temas.

La auditoría del 2026-11-03 no tiene vulnerabilidades high ni critical. Tiene
dos moderadas transitivas (`glob` y `minimatch`) dentro de herramientas de
empaquetado de Electron Forge, no en el runtime distribuido. El gate bloquea
high/critical; estas dos se revisan antes de cada actualización de Forge o
release público y no se fuerzan con overrides incompatibles.

## Límites de la siguiente entrega

El shell implementa notebooks anidados, etiquetas, estados, plantillas como
filtro de notas marcadas, papelera recuperable, toolbar y los tres modos de
edición. No hay gestor de adjuntos, aplicación automática de plantillas,
marketplace ni edición de la distribución por plugins. Un proveedor remoto
requiere contrato y pruebas de recuperación antes de activarse.

## Fuentes

- Inkdrop, [base local y flujo de sync](https://developers.inkdrop.app/guides/access-the-local-database), [Flux](https://developers.inkdrop.app/guides/flux-architecture), [configuración](https://developers.inkdrop.app/modules/config), [comandos](https://developers.inkdrop.app/modules/command-registry), [Environment](https://developers.inkdrop.app/modules/environment) y [lifecycle de paquetes](https://developers.inkdrop.app/modules/package-manager).
- Inkdrop, [layouts](https://developers.inkdrop.app/states/layouts), [estado mainLayout](https://developers.inkdrop.app/states/main-layout) y [creación de temas](https://developers.inkdrop.app/guides/create-a-theme).
- Inkdrop CSS: [layers](https://github.com/inkdropapp/css/blob/main/layers.css), [tokens](https://github.com/inkdropapp/css/blob/main/tokens.css), [utilities](https://github.com/inkdropapp/css/blob/main/utilities.css), [UI](https://github.com/inkdropapp/css/blob/main/ui.css), [status](https://github.com/inkdropapp/css/blob/main/status.css), [tags](https://github.com/inkdropapp/css/blob/main/tags.css) y [task progress](https://github.com/inkdropapp/css/blob/main/task-progress.css).
- Inkdrop, [template de tema de ipm](https://github.com/inkdropapp/ipm-cli/tree/main/templates/theme) y [theme-dev-helpers](https://github.com/inkdropapp/theme-dev-helpers).
- Inkdrop, [formatos y arquitecturas de instalación](https://docs.inkdrop.app/start-guide).
- API docs de Inkdrop: [flujo Flux fuente](https://github.com/inkdropapp/api-docs/blob/2f7bae8a656b439c6226ed060de89e9cf76c18aa/src/app/guides/flux-architecture/page.mdx) y [base local fuente](https://github.com/inkdropapp/api-docs/blob/2f7bae8a656b439c6226ed060de89e9cf76c18aa/src/app/guides/access-the-local-database/page.mdx).
- Electron, [seguridad](https://www.electronjs.org/docs/latest/tutorial/security/).
- Zod, [validación sin compilación dinámica bajo CSP](https://zod.dev/compile#content-security-policy).
- [React Markdown](https://github.com/remarkjs/react-markdown) y [Lucide](https://github.com/lucide-icons/lucide).
- Electron Forge, [CLI](https://www.electronforge.io/cli), [Squirrel.Windows](https://www.electronforge.io/config/makers/squirrel.windows), [DEB](https://www.electronforge.io/config/makers/deb) y [RPM](https://www.electronforge.io/config/makers/rpm).
- npm audit, [advisory de minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) y [advisory de glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
