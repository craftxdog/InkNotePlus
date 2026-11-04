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
  - core.appearance: tema, paneles, tipografía, opciones del editor/preview,
    notebook predeterminado, contexto de biblioteca y atajos personalizados.

Las preferencias pasan por un IPC propio validado y persisten en config.json.
Los cambios se ordenan para evitar que una respuesta antigua reemplace la
selección reciente. Un fallo de escritura restaura la última preferencia
confirmada y se informa en Preferencias.
La pantalla reúne General, Edición, Vista previa, Temas y Atajos. Sólo muestra
opciones implementadas. Los ajustes de CodeMirror se reconfiguran con un
Compartment, conservando documento, selección e historial. Los atajos usan
comandos/contextos, admiten secuencias y detectan conflictos de prefijo. Los
atajos de aplicación se resuelven fuera del keymap interno de CodeMirror;
Buscar abre el panel oficial de búsqueda/reemplazo del editor.

Los contadores se consultan en SQLite, separados de las páginas de 50 notas.
Detail limita notas, estados y etiquetas al notebook y sus descendientes;
los breadcrumbs permiten volver a sus padres o a la biblioteca. Un notebook
expandido filtra notas directas; uno contraído incluye descendientes. Los
filtros y la ordenación se aplican antes de paginar. Los eventos vuelven a
consultar la ventana cargada para evitar omisiones al fijar/desfijar notas.
La migración 4 añade iconos persistentes a notebooks sin modificar notas.

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
Los cambios de título, cuerpo, notebook, estado, etiquetas, pin y plantilla se
guardan automáticamente, también en borradores aparcados al cambiar de nota.
InkNote agrupa escrituras después de 600 ms de pausa, con un límite de 2 s durante
escritura continua; estos intervalos son decisiones de InkNote. Un guardado en
curso conserva las ediciones nuevas y actualiza su revisión antes de la siguiente
escritura. Los títulos preservan espacios mientras se escribe.

Al cerrar la ventana, un handshake IPC con UUID y validación de emisor espera a
que terminen preferencias y borradores pendientes. Si SQLite rechaza la escritura,
la ventana permanece abierta y el borrador conserva su contenido. La DB y módulos
se cierran en `will-quit`, después de ese guardado. No se promete recuperación
del texto pendiente ante un cierre forzado del proceso o fallo del sistema.

El preview sigue el Markdown en vivo y usa posiciones del AST para mapear bloques
entre ambos paneles. El scroll se sincroniza en ambas direcciones, con anclajes
de línea/columna compatibles con LF y CRLF, caché de medidas, listeners pasivos
y una actualización por frame. Las medidas se invalidan al cambiar contenido,
anchura o tema; la conexión sigue la instancia real de CodeMirror en StrictMode.
El estado de scroll no pasa por Zustand ni provoca un render de React.

Las fórmulas inline, display y fences `math` usan el componente MIT público de
Inkdrop con KaTeX 0.19.0, estilos aislados y fuentes WOFF2 locales. Mermaid usa
su componente público y Pele 1.9.0, la versión fijada por ese repositorio.
Ambos se cargan a demanda. Los commits, licencias y cambios locales constan en
`src/renderer/vendor/sources.json`; las licencias se incluyen en el paquete.
`pnpm run build:math-styles` regenera la hoja aislada usando el generador de Inkdrop.
La dependencia opcional de KaTeX del parser se unifica con la versión revisada
del host: sólo consume `renderToString`, y evita distribuir la copia vulnerable
0.16 de `micromark-extension-math` (GHSA-238p-pmpm-9mq7).

Los diagramas conservan controles, pantalla completa, pinch/zoom, arrastre,
teclado y colores de los tokens oficiales. En línea, Inkdrop sólo habilita zoom
cuando el diagrama se reduce para caber; en pantalla completa siempre puede
ampliarse. Pele cubre las 33 familias de las muestras del repositorio de Inkdrop;
su layout no promete equivalencia geométrica con Mermaid.js ni versiones futuras.
No se ejecutan directivas de JavaScript ni se cargan imágenes remotas del diagrama.

Las tareas GFM del preview son controles accesibles: cambian sólo el carácter del
marcador correspondiente en el Markdown, actualizan CodeMirror y entran en el
autoguardado. Se conserva el cursor con cambios mínimos y el cambio admite deshacer.
Los callbacks de un preview desactualizado no sobreescriben texto nuevo. Las notas
de la papelera permanecen de sólo lectura; el código con apariencia de tarea no
se interpreta como una casilla editable.

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
Producción conserva hojas locales y nonce para los elementos de estilo dinámicos.
`style-src-attr 'unsafe-inline'` permite las medidas que KaTeX y Pele generan
en atributos de estilo; no autoriza scripts inline ni HTML crudo de las notas.

`pnpm run test:desktop` arranca Forge y Electron con un perfil temporal, sin
mocks de preload o IPC. Comprueba el primer montaje, CSS aplicado, escritura
SQLite sin guardado manual, metadata, tareas y deshacer, scroll bidireccional,
última edición al cerrar, preferencias persistidas tras recargar y CSP.
También verifica fuentes de math, Mermaid con pinch/pan/reset, iconos de
notebooks, contadores visibles, Detail y breadcrumbs. La opción
`--notes-database=/ruta/a/base.sqlite` revisa notas existentes mediante copias
en el perfil temporal; abre la base original exclusivamente en modo lectura.
`pnpm run test:desktop:package` comprueba el paquete nativo previamente construido.
La prueba incluye los siete temas, protocolo de recursos instalados, CSS personal
con recarga, imágenes importadas y pegadas, tamaños Marp, plantillas, búsquedas
calificadas y fijado. `pnpm run test:desktop --catalog` añade una prueba con red:
consulta el catálogo público e instala y activa un tema desde Preferencias.
Las descargas usan `fetch` de Node en main, con redirecciones HTTPS validadas;
el modo manual de `net.fetch` cancela la redirección del tarball en esta versión
de Electron. Los temas y notas de prueba sólo se escriben en perfiles temporales.
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
El catálogo valida los manifests y respeta el orden de `styleSheets`, incluido
un archivo de tokens o paleta compartida antes de las tres áreas. Incluye los
temas oficiales Solarized Light/Dark y Kanagawa Wave/Dragon/Lotus, con origen,
revisión y hashes en `themes/upstream-sources.json`. Sus fuentes se conservan;
sólo se añade un LF final a los JSON de paletas. Por eso el formateador excluye
esos cinco paquetes, y una prueba comprueba sus hashes contra las fuentes.

ThemeManager precarga todas las hojas sin aplicarlas y cambia el paquete de
forma atómica. `onDidChangeActiveThemes` se emite después de cargar las hojas;
Mermaid vuelve a renderizar con los colores efectivos. Una carga fallida
mantiene el tema anterior y cancela selecciones pendientes obsoletas.

Preferencias consulta el catálogo público de Inkdrop mediante las rutas v2 y
la cabecera de versión que usa su IPM. Permite instalar temas unificados de
Inkdrop 6 e importar carpetas descargadas. Los paquetes se guardan bajo
`<userData>/themes`, sin ejecutar scripts ni instalar sus dependencias. La
importación rechaza enlaces de archivos, rutas que escapan del paquete,
archivos excesivos, CSS remoto y paquetes v5. El protocolo restringido
`inknote-asset:` sirve únicamente CSS, fuentes e imágenes permitidas.
El catálogo depende de un servicio externo: si no responde, la interfaz
muestra el error y ofrece reintentar o importar una carpeta local.

`<userData>/styles.css` sobreescribe el tema después de sus hojas. El editor
de Preferencias guarda automáticamente CSS válido; conserva el borrador si
hay errores y lo incluye en el protocolo de cierre. Un watcher recarga cambios
externos. No se ejecuta JavaScript de temas o de estilos.

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
- core.themes: catálogo, importación, eliminación y estilos personales.
- core.images: importación validada de imágenes y archivos locales gestionados.
- core.links: abre enlaces web permitidos mediante el navegador del sistema.
- core.notes: abre SQLite, crea comandos, outbox e IPC de notas y biblioteca.

El manifiesto de extensión sólo es un contrato declarativo. Valida versión de
API, IDs con namespace, capacidades y contribuciones. No existe cargador,
marketplace ni ejecución de código de terceros. Eso es intencional: un plugin
futuro necesitará activate/deactivate, Disposable, capacidades mínimas y un
entorno limitado; no acceso directo a la DB ni a Electron.

El renderer tiene un registro de componentes React de confianza y contribuciones
a los layouts publicados por Inkdrop. Las altas devuelven Disposable y sólo el
propietario puede eliminar una contribución. El botón de elegir plantilla usa
este registro. Las extensiones se aíslan con un error boundary; no se evalúan
archivos JavaScript descargados del catálogo de temas.

## Organización, búsqueda, plantillas e imágenes

Las notas nuevas empiezan en `none` (Sin estado); los estados ya guardados se
conservan. Dentro de un notebook se ocultan `completed` y `dropped`, salvo que
una consulta incluya explícitamente un estado. Los estados siguen accesibles
en la biblioteca. El menú contextual permite crear subnotebooks, abrir Detail
y cambiar iconos. Las notas se fijan desde el menú contextual o con P cuando
la fila tiene foco; Mod-J abre las acciones del editor.

La búsqueda distingue filtro de vista y búsqueda global. Acepta `book:`,
`tag:`, `status:`, `title:` y `body:`, frases entre comillas y exclusiones `-`.
Los términos se combinan con AND y los valores se enlazan como parámetros SQL;
las búsquedas de texto usan FTS5 y no realizan coincidencias por subcadena.
No se admiten consultas formadas sólo por exclusiones. Listado y contador
comparten el compilador de búsqueda. Mod-Shift-F filtra la vista;
Mod-Alt-Shift-F busca globalmente y Escape limpia el filtro.

Una nota vacía ofrece un selector de plantillas con búsqueda, navegación por
teclado y preview. Mod-T lo abre. Las plantillas personales se almacenan como
notas con `isTemplate`; el selector pagina los resultados. El parser YAML
procesa `_template` sin aliases y conserva otro frontmatter. Aplica título,
notebook local, etiquetas y estado; no borra etiquetas o estados ya elegidos.
La fecha usa los marcadores documentados (`%Y`, `%m`, `%d`, `%H`, `%M`, `%A`,
etc.) y `{% uuid %}` genera identificadores. No es un intérprete Liquid general.
Los blockquotes de instrucciones con encabezado `!` se omiten al generar la nota.
Se incluye el ejemplo Daily Report publicado en la guía, adaptado sin notebook
fijo; el resto de la biblioteca privada de plantillas de Inkdrop no se inventa.
Personalizar el ejemplo crea una plantilla propia y conserva el original.

El editor importa, pega o recibe por arrastre PNG, JPEG, GIF y WebP. Se limitan
a 5 MB y 16 megapíxeles antes de decodificar; se validan en main y se almacenan
por hash bajo `<userData>/images`. Markdown sólo renderiza estas URLs gestionadas;
las imágenes remotas siguen sin solicitarse. Los archivos se guardan junto al
perfil y todavía no tienen transporte de sincronización remota.
La sintaxis Marp de alt admite `width:`, `height:`, `w:` y `h:`, números en px
y las unidades documentadas. Con el cursor dentro de una imagen, la toolbar
ofrece Automático, 30 %, 50 % y 100 %. El cambio conserva deshacer, actualiza
el Markdown y el preview y se guarda automáticamente.

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
  sin permitir scripts inline. Los atributos de estilo de los renderers están
  permitidos; las notas no pasan por un parser de HTML crudo.
- Fuses desactivan RunAsNode, NODE_OPTIONS e inspect arguments; ASAR tiene
  validación de integridad.
- Notas, rutas y SQL no se mandan a telemetría, APIs ni servicios externos.

No se afirma cifrado extremo a extremo, autenticación ni
sincronización remota hasta que existan claves, recuperación y pruebas reales.

## Distribución

Electron Forge empaqueta la aplicación. Los makers de Forge generan Windows y
Linux; macOS empaqueta la app con Forge y crea un DMG UDZO con
`diskutil image create from`, o `hdiutil` cuando la API nueva no existe.
El volumen contiene `InkNote.app` y el acceso a `/Applications`. La firma se
aplica después de modificar plist, fuses y metadatos ASAR; se comprueba antes
de crear la imagen. Cada DMG incluye un archivo SHA-256.
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
Las acciones de GitHub están fijadas a commits. El workflow monta y copia el
DMG a una carpeta temporal, instala Setup en Windows, DEB mediante apt en
Ubuntu y RPM mediante dnf en Fedora 44. Cada instalación inicia la aplicación
con un perfil temporal y ejecuta las pruebas reales del editor. No se desactiva
el sandbox para ejecutar estas pruebas.

Los DMG locales usan firma ad hoc, sin Team ID ni runtime endurecido. No son
distribuciones notarizadas. `INKNOTE_MAC_SIGN_IDENTITY` permite usar Developer
ID Application con runtime endurecido; `INKNOTE_MAC_NOTARY_PROFILE` selecciona
credenciales ya guardadas en el llavero. `INKNOTE_REQUIRE_SIGNING=1` impide
generar una distribución sin identidad real. La validación local de firma no
equivale a aprobación de Gatekeeper. Windows requiere su certificado para
firmar una distribución pública y establecer reputación de SmartScreen.

Fuentes: [firma macOS de Forge](https://www.electronforge.io/guides/code-signing/code-signing-macos),
[notarización de Apple](https://developer.apple.com/documentation/security/resolving-common-notarization-issues),
[instalación Squirrel](https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/install-process.md)
y [Electron en CI sin pantalla](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci).

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

El shell implementa notebooks anidados, etiquetas, estados, plantillas
aplicables, imágenes locales, papelera, toolbar y los tres modos de edición.
El catálogo instala temas CSS; no instala plugins ejecutables de Inkdrop.
No se replica su biblioteca privada de plantillas ni su servicio de cuenta.
Un proveedor remoto requiere contrato y pruebas de recuperación antes de activarse.

## Fuentes

- Inkdrop, [gestor de temas](https://developers.inkdrop.app/modules/theme-manager), [extender la UI](https://developers.inkdrop.app/guides/extend-the-ui) y [ajustes CSS](https://developers.inkdrop.app/guides/style-tweaks).
- Inkdrop, [imágenes Marp](https://docs.inkdrop.app/reference/resize-images), [plantillas](https://docs.inkdrop.app/reference/note-templates), [búsqueda](https://docs.inkdrop.app/reference/search-and-filter-notes), [estados](https://docs.inkdrop.app/reference/note-statuses) y [fijado](https://docs.inkdrop.app/reference/pin-notes-to-top).
- Inkdrop, [catálogo público](https://my.inkdrop.app/plugins/theme) y [cliente IPM v2](https://github.com/inkdropapp/ipm/blob/main/src/registry.ts).
- [node-tar](https://isaacs.github.io/node-tar/) y [YAML](https://eemeli.org/yaml/).

- Inkdrop, [base local y flujo de sync](https://developers.inkdrop.app/guides/access-the-local-database), [Flux](https://developers.inkdrop.app/guides/flux-architecture), [configuración](https://developers.inkdrop.app/modules/config), [comandos](https://developers.inkdrop.app/modules/command-registry), [Environment](https://developers.inkdrop.app/modules/environment) y [lifecycle de paquetes](https://developers.inkdrop.app/modules/package-manager).
- Inkdrop, [layouts](https://developers.inkdrop.app/states/layouts), [estado mainLayout](https://developers.inkdrop.app/states/main-layout) y [creación de temas](https://developers.inkdrop.app/guides/create-a-theme).
- Inkdrop CSS: [layers](https://github.com/inkdropapp/css/blob/main/layers.css), [tokens](https://github.com/inkdropapp/css/blob/main/tokens.css), [utilities](https://github.com/inkdropapp/css/blob/main/utilities.css), [UI](https://github.com/inkdropapp/css/blob/main/ui.css), [status](https://github.com/inkdropapp/css/blob/main/status.css), [tags](https://github.com/inkdropapp/css/blob/main/tags.css) y [task progress](https://github.com/inkdropapp/css/blob/main/task-progress.css).
- Inkdrop, [template de tema de ipm](https://github.com/inkdropapp/ipm-cli/tree/main/templates/theme) y [theme-dev-helpers](https://github.com/inkdropapp/theme-dev-helpers).
- Inkdrop, [formatos y arquitecturas de instalación](https://docs.inkdrop.app/start-guide).
- API docs de Inkdrop: [flujo Flux fuente](https://github.com/inkdropapp/api-docs/blob/2f7bae8a656b439c6226ed060de89e9cf76c18aa/src/app/guides/flux-architecture/page.mdx) y [base local fuente](https://github.com/inkdropapp/api-docs/blob/2f7bae8a656b439c6226ed060de89e9cf76c18aa/src/app/guides/access-the-local-database/page.mdx).
- Electron, [seguridad](https://www.electronjs.org/docs/latest/tutorial/security/).
- Zod, [validación sin compilación dinámica bajo CSP](https://zod.dev/compile#content-security-policy).
- [React Markdown](https://github.com/remarkjs/react-markdown) y [Lucide](https://github.com/lucide-icons/lucide).
- Inkdrop, [organización de notebooks, Detail y contadores](https://docs.inkdrop.app/reference/organize-notebooks), [atajos](https://docs.inkdrop.app/reference/key-customizations) y [comandos](https://developers.inkdrop.app/guides/list-of-commands).
- Inkdrop, [renderer Mermaid](https://github.com/inkdropapp/mermaid/tree/3ab64f2f470de0be11119d816d032902c12a23e7/packages/mermaid) y [renderer Math](https://github.com/inkdropapp/inkdrop-math/tree/dd3cc053b73d7f5abf2bc9b49e7273948a9ee94f/packages/math).
- KaTeX, [opciones y trust](https://katex.org/docs/options), y CodeMirror, [búsqueda](https://github.com/codemirror/search).
- Electron Forge, [CLI](https://www.electronforge.io/cli), [Squirrel.Windows](https://www.electronforge.io/config/makers/squirrel.windows), [DEB](https://www.electronforge.io/config/makers/deb) y [RPM](https://www.electronforge.io/config/makers/rpm).
- npm audit, [advisory de minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) y [advisory de glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
