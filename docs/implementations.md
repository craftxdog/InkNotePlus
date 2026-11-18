# Implementaciones pendientes frente a Inkdrop

**Fecha de la auditoría:** 2026-11-18
**Versión auditada:** InkNote 1.4.0, rama `codex/improve-notebooks-codeblocks`, commit `1a2559d`
**Referencias:** [inkdrop.app](https://www.inkdrop.app/), [guía de usuario](https://docs.inkdrop.app/start-guide) y [documentación para desarrolladores](https://developers.inkdrop.app/)

## Resumen

InkNote tiene una base sólida y todas sus pruebas pasan, pero esas pruebas no cubrían
varias diferencias con Inkdrop. La auditoría registró **23 funciones implementadas de
forma incorrecta o incompleta** y **31 funciones sin implementar**. Ya están resueltos
INC-01 a INC-08, INC-11, INC-12, INC-13, INC-15, FAL-03, FAL-04, FAL-05, FAL-08, FAL-09, FAL-10 y FAL-11, así que quedan **11 incorrectas y 24 faltantes**.

| Prioridad     | Significado                                       | Incorrectas | Faltantes |  Total |
| ------------- | ------------------------------------------------- | ----------: | --------: | -----: |
| P0            | Riesgo para el uso diario o los datos (resueltos) |           0 |         0 |      0 |
| P1            | Función básica que el usuario espera              |           0 |         4 |      4 |
| P2            | Paridad importante                                |           8 |        11 |     19 |
| P3            | Ecosistema, integraciones y mejoras               |           3 |         9 |     12 |
| **Pendiente** |                                                   |      **11** |    **24** | **35** |

El siguiente bloque recomendado es cerrar escritura y lectura con **INC-16** y **FAL-21**.

## Resultados de las pruebas

| Prueba                                    | Resultado                                            |
| ----------------------------------------- | ---------------------------------------------------- |
| `pnpm run lint`                           | Aprobado                                             |
| `pnpm run typecheck`                      | Aprobado                                             |
| `pnpm run test`                           | Aprobado: 454 pruebas en 78 archivos                 |
| `pnpm run build`                          | Aprobado                                             |
| `pnpm run test:desktop:package`           | Aprobado                                             |
| `pnpm run test:desktop:qa`                | Aprobado: 7 de 7 bloques, incluido el de 3.000 notas |
| Sonda de paridad sobre la app empaquetada | 12 diferencias de comportamiento confirmadas         |

La sonda manejó la app empaquetada con un perfil temporal y no tocó datos reales.

### Qué no se pudo comprobar

- **Inkdrop no se ejecutó.** La comparación usa su documentación pública, no la app real.
- **Solo se probó macOS Apple Silicon.** Windows, Linux y macOS Intel quedan sin probar en esta auditoría.
- **Los atajos se simularon por CDP.** Las combinaciones con Option en un teclado físico siguen sin confirmar (ver INC-22).
- **La instalación de temas desde el catálogo en línea no se ejecutó** (`--catalog`).
- **Algunas páginas de Inkdrop devuelven 404:** importación, exportación, historial de revisiones y lista de atajos. Para esas funciones la fuente es [inkdrop.app/features](https://www.inkdrop.app/features).

### Cómo leer la evidencia

- **Sonda:** comportamiento observado en la app empaquetada.
- **Código:** comprobado leyendo el código fuente.

## Decisiones que debes tomar

Estas tres decisiones cambian el alcance del trabajo, así que conviene resolverlas antes de empezar las tareas afectadas.

| ID  | Decisión                       | Opciones                                                                            | Recomendación                                                                                                                                                                                                       | Afecta         |
| --- | ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| D-1 | Imágenes remotas en el preview | Mantener el bloqueo actual, cargarlas siempre como Inkdrop, o cargarlas con permiso | Permiso por nota o preferencia global, desactivado por defecto. Evita que una nota revele tu IP a terceros. Los títulos de enlaces ya se resolvieron con permiso explícito; las imágenes remotas siguen bloqueadas. | Preview        |
| D-2 | Protocolo de sincronización    | Compatible con CouchDB como Inkdrop, o propio sobre el `sync_outbox` existente      | CouchDB si quieres servidores autoalojados. Exige adaptar IDs y `_rev` (INC-23).                                                                                                                                    | FAL-16, FAL-17 |
| D-3 | Compatibilidad de plugins      | API compatible con plugins de Inkdrop, o API propia con permisos limitados          | API propia. `docs/architecture.md` ya descarta dar acceso directo a Electron y a la base de datos.                                                                                                                  | FAL-18, FAL-19 |

## Diferencias técnicas

| Área           | Inkdrop                                 | InkNote                                       | Valoración                                             |
| -------------- | --------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Escritorio     | Electron                                | Electron 45                                   | Alineado                                               |
| Interfaz       | React con Redux                         | React 19 con Zustand                          | Diferencia deliberada y documentada                    |
| Editor         | CodeMirror 6                            | CodeMirror 6                                  | Alineado                                               |
| Markdown       | unified 10, remark 14, remark-rehype 10 | unified 11, remark-parse 11, remark-rehype 11 | Los plugins de Inkdrop pueden no ser compatibles (D-3) |
| Datos          | PouchDB con índice SQLite               | SQLite con `node:sqlite`                      | Diferencia deliberada                                  |
| Búsqueda       | SQLite FTS5 con ranking                 | SQLite FTS5 con `bm25`                        | Alineado                                               |
| Sincronización | CouchDB, `_rev`, `_changes`             | Outbox local sin transporte                   | Incompleto (FAL-16)                                    |
| Atajos         | `keymap.json` con selectores CSS        | Lista de sustituciones en Preferencias        | Incompleto (FAL-13)                                    |
| Temas          | `@inkdropapp/css`, capas `theme.*`      | Los mismos tokens y capas                     | Alineado                                               |
| Extensiones    | `activate(env)`, `ipm`, `init.js`       | Solo un manifiesto, sin cargador              | Sin implementar (FAL-18, FAL-19)                       |

## Parte 1: implementado de forma incorrecta o incompleta

### P0: corregir primero

#### INC-01. Cmd+← y Cmd+→ cambian de nota mientras escribes

**Estado: resuelto el 2026-11-18.** Cmd+← y Cmd+→ mueven el cursor en campos de texto y siguen navegando fuera de ellos. Comprobado en la app empaquetada.

- **Evidencia (Sonda):** con el cursor en el editor de «Second note», Cmd+← abrió «Probe render» en lugar de llevar el cursor al inicio de la línea.
- **Causa:** `core:navigate-back` y `core:navigate-forward` tienen alcance `app` y se capturan antes que CodeMirror. Ver [keybindings.ts:192](../src/shared/keybindings.ts:192) y [shortcuts.ts:55](../src/renderer/shortcuts.ts:55).
- **Inkdrop:** usa esas teclas para navegar por el historial, pero el movimiento dentro de una línea es una acción básica en macOS.
- **Cambio:** no ejecutar estos comandos en macOS cuando el foco esté en `.cm-content` o en un campo de texto.
- **Aceptación:** Cmd+← y Cmd+→ mueven el cursor dentro del editor y siguen navegando fuera de él. Añadir una prueba de regresión en `tests/renderer/shortcuts.test.ts`.

#### INC-02. Se pueden abrir dos instancias sobre el mismo perfil

**Estado: resuelto el 2026-11-18.** La segunda instancia termina y la primera sigue activa. Comprobado en la app empaquetada. El paso de la ventana al frente solo tiene prueba unitaria.

- **Evidencia (Sonda):** una segunda instancia con el mismo `--user-data-dir` siguió en ejecución junto a la primera. No se comprobó si llega a corromper datos.
- **Causa:** [main.ts:395](../src/main.ts:395) no llama a `app.requestSingleInstanceLock()`.
- **Riesgo:** dos procesos escriben en la misma base SQLite, en `config.json` y en la carpeta de respaldo.
- **Cambio:** pedir el bloqueo antes de abrir la base, salir si no se obtiene y enfocar la ventana existente en `second-instance`.
- **Aceptación:** el segundo proceso termina y la ventana original pasa al frente.

### P1: comportamiento básico

#### INC-03. Las notas completadas y descartadas aparecen en Todas las notas y en etiquetas

**Estado: resuelto el 2026-11-18.** Todas las notas, las etiquetas, los notebooks y sus contadores ocultan esas notas, y la búsqueda las sigue encontrando. Comprobado en la app empaquetada.

- **Evidencia (Código):** [library-actions.ts:71](../src/renderer/state/library-actions.ts:71) y [library-actions.ts:88](../src/renderer/state/library-actions.ts:88) no aplican `excludeFinished`. Solo lo hace la vista de notebook.
- **Inkdrop:** las [oculta en All Notes, notebooks y etiquetas](https://docs.inkdrop.app/start-guide/how-to-organize-notes). La búsqueda por palabras clave sí las encuentra.
- **Cambio:** añadir `excludeFinished: true` a las vistas `all` y `tag`, y alinear los contadores.
- **Aceptación:** esas notas solo se ven en su estado o mediante búsqueda.

#### INC-04. Cmd/Ctrl+D borra la línea en vez de duplicar la nota

**Estado: resuelto el 2026-11-18.** Cmd/Ctrl+D duplica la nota y `editor:delete-line` queda sin atajo por defecto. Comprobado en la app empaquetada.

- **Evidencia (Sonda):** el atajo vació la línea y el número de notas siguió en 3. Ver [editor-keybindings.ts:46](../src/shared/editor-keybindings.ts:46).
- **Inkdrop:** [Cmd/Ctrl+D duplica la nota](https://www.inkdrop.app/features).
- **Cambio:** asignar el atajo a `core:duplicate-note` (FAL-04) y dejar `editor:delete-line` sin atajo por defecto.
- **Aceptación:** el atajo crea una copia y no modifica el texto.

#### INC-05. Un guion suelto o unas comillas sin cerrar vacían la búsqueda

**Estado: resuelto el 2026-11-18.** El guion suelto se ignora y una comilla abierta busca la frase escrita hasta ese punto. Comprobado en la app empaquetada.

- **Evidencia (Sonda):** `foo - bar` devuelve 0 resultados aunque existe una nota con «foo - bar baz». `"foo` también devuelve 0 mientras se escribe.
- **Causa:** [note-search.ts:48](../src/shared/note-search.ts:48) invalida toda la consulta si un término queda vacío, y [note-search.ts:42](../src/shared/note-search.ts:42) rechaza las comillas sin cerrar.
- **Cambio:** tratar `-` aislado como separador ignorable y una comilla sin cerrar como frase hasta el final del texto.
- **Aceptación:** ambas consultas devuelven resultados. `-tag:x` por sí solo sigue sin ser válido, como indica Inkdrop.

#### INC-06. Las notas al pie no navegan

**Estado: resuelto el 2026-11-18.** La referencia y el enlace de vuelta se desplazan dentro del preview, también con etiquetas acentuadas. Comprobado con clics reales en la app empaquetada.

- **Evidencia (Sonda):** al pulsar la referencia, el preview no se desplaza.
- **Causa:** [markdown-preview.tsx:143](../src/renderer/editor/markdown-preview.tsx:143) envía los enlaces `#user-content-fn-1` al manejador de enlaces externos.
- **Cambio:** resolver los enlaces `#` dentro del contenedor del preview, incluido el enlace de vuelta.
- **Aceptación:** la referencia lleva a la nota y la flecha de retorno vuelve al texto.

#### INC-07. `<sub>` y `<sup>` pierden su formato

**Estado: resuelto el 2026-11-18.** Los pares exactos se muestran en preview, HTML y PDF, y el resto del HTML sigue bloqueado. Comprobado en la app empaquetada.

- **Evidencia (Sonda):** `H<sub>2</sub>O` se muestra como «H2O» y `x<sup>2</sup>` como «x2».
- **Causa:** `skipHtml` en [markdown-preview.tsx:86](../src/renderer/editor/markdown-preview.tsx:86) elimina esas etiquetas.
- **Inkdrop:** [admite subíndice y superíndice](https://docs.inkdrop.app/writing/basic-writing-and-formatting-syntax) con estas etiquetas.
- **Cambio:** convertir pares exactos a nodos seguros, como ya hace `remarkHighlights` con `<mark>`. No hace falta activar HTML libre.
- **Aceptación:** se renderizan en preview, HTML y PDF, y otras etiquetas siguen bloqueadas.

#### INC-08. La paleta Cmd+K solo busca comandos

**Estado: resuelto el 2026-11-18.** La paleta busca comandos, notebooks, etiquetas, esquema y temas, con prefijos y acciones por tecla. Comprobado en la app empaquetada.

- **Evidencia (Sonda):** `b Proyecto`, `# Footnote` y `h kanagawa` devuelven 0 resultados. `t alpha` devuelve comandos sin relación. Ver [command-palette.tsx:45](../src/renderer/components/command-palette.tsx:45).
- **Inkdrop:** [Telescope](https://docs.inkdrop.app/reference/fuzzy-finder-telescope) tiene las fuentes `>` comandos, `b` notebooks, `t` etiquetas, `#` encabezados y tareas, y `h` temas.
- **Cambio:** crear un registro de fuentes con prefijos y acciones. Enter abre, Cmd/Ctrl+Enter abre como workspace o añade al filtro, y Mayús+Enter mueve la nota o añade la etiqueta.
- **Aceptación:** cada prefijo limita los resultados a su fuente y sin prefijo se buscan todas.

### P2: paridad importante

#### INC-09. Los ID de comando no coinciden con Inkdrop

- **Evidencia (Código):** [keybindings.ts](../src/shared/keybindings.ts) usa nombres propios.

| InkNote                   | Inkdrop                               |
| ------------------------- | ------------------------------------- |
| `core:focus-search`       | `core:find`                           |
| `core:pin-note`           | `core:pin-note-to-top`                |
| `editor:toggle-drawer`    | `core:show-editor-action-menu`        |
| `editor:status-none`      | `editor:change-note-status-none`      |
| `editor:status-active`    | `editor:change-note-status-active`    |
| `editor:status-onhold`    | `editor:change-note-status-onhold`    |
| `editor:status-completed` | `editor:change-note-status-completed` |
| `editor:status-dropped`   | `editor:change-note-status-dropped`   |

- **Cambio:** renombrar y añadir los ID antiguos a `legacyCommandIds` para conservar los atajos guardados.
- **Aceptación:** los atajos personalizados existentes siguen funcionando tras actualizar.

#### INC-10. Faltan atajos por defecto

- **Evidencia (Sonda):** ninguna de estas combinaciones produce efecto.

| Acción                         | macOS       | Windows y Linux | Estado en InkNote            |
| ------------------------------ | ----------- | --------------- | ---------------------------- |
| Insertar enlace                | Cmd+Alt+K   | Ctrl+Alt+K      | El comando existe, sin atajo |
| Mover nota a notebook (editor) | Cmd+Ctrl+M  | Ctrl+Alt+M      | No existe                    |
| Mover nota (lista con foco)    | `m`         | `m`             | No existe                    |
| Nota en ventana separada       | Cmd+Shift+N | Ctrl+Shift+N    | No existe (FAL-20)           |

- **Aceptación:** cada atajo ejecuta su acción y aparece en Preferencias.

#### INC-11. El filtro por etiquetas admite una sola etiqueta

**Estado: resuelto el 2026-11-18.** Pulsar etiquetas en la lista acumula filtros con lógica AND y Alt+clic deja solo la pulsada. Comprobado en la app empaquetada.

- **Evidencia (Código):** `tag` es un único valor en [ipc.ts:48](../src/shared/ipc.ts:48) y [library-actions.ts:89](../src/renderer/state/library-actions.ts:89).
- **Inkdrop:** varias etiquetas [reducen los resultados](https://docs.inkdrop.app/start-guide/how-to-organize-notes), y Alt+clic deja solo la pulsada.
- **Cambio:** aceptar `tags: string[]` con lógica AND y permitir el filtro desde las etiquetas de la lista.

#### INC-12. Las acciones múltiples solo permiten enviar a la papelera

**Estado: resuelto el 2026-11-18.** El menú de la lista permite mover, etiquetar, cambiar estado, duplicar y enviar a la papelera, cada lote en una transacción. Comprobado en la app empaquetada.

- **Evidencia (Sonda):** con dos notas seleccionadas, el menú solo ofrece «Mover a papelera». Ver [note-list.tsx:252](../src/renderer/components/note-list.tsx:252).
- **Inkdrop:** [mover, etiquetar, cambiar estado y eliminar](https://www.inkdrop.app/features) en lote.
- **Cambio:** añadir esas acciones en una sola transacción SQLite.

#### INC-13. La ordenación es limitada

**Estado: resuelto el 2026-11-18.** Título, creación y modificación admiten ambos sentidos, también con los comandos `view:sort-by-*`. Comprobado en la app empaquetada.

- **Evidencia (Sonda y código):** solo hay «Última modificación» y «Título». Ver [preferences.ts:30](../src/shared/preferences.ts:30).
- **Inkdrop:** título, fecha de creación y fecha de modificación, en orden [ascendente o descendente](https://developers.inkdrop.app/guides/list-of-commands).
- **Cambio:** ampliar `noteSort` y el `ORDER BY`, con migración del valor guardado.

#### INC-14. Los límites son más estrictos que en Inkdrop

- **Evidencia (Código):**

| Límite               | InkNote              | Inkdrop                         | Ubicación                                                |
| -------------------- | -------------------- | ------------------------------- | -------------------------------------------------------- |
| Etiquetas por nota   | 32                   | Sin límite anunciado            | [note-metadata.ts:14](../src/shared/note-metadata.ts:14) |
| Longitud de etiqueta | 40                   | 64                              | [tags.ts:3](../src/shared/tags.ts:3)                     |
| Tamaño de imagen     | 5 MB                 | 10 MB                           | [images.ts:18](../src/shared/images.ts:18)               |
| Formatos de imagen   | PNG, JPEG, GIF, WebP | PNG, JPEG, SVG, GIF, HEIC, HEIF | [images.ts:4](../src/shared/images.ts:4)                 |

- **Cambio:** igualar los límites. SVG debe mostrarse solo como `<img>` y sanearse antes de guardarse. Conserva WebP.

#### INC-15. Los bloques de código están incompletos

**Estado: resuelto el 2026-11-18.** Hay botón de copiar, icono por familia de lenguaje y una preferencia para numerar siempre las líneas. Lucide no incluye logotipos de marca, así que los iconos representan familias y no cada lenguaje. Comprobado en la app empaquetada.

- **Evidencia (Sonda y código):** no hay botón de copiar, el icono es genérico y los números de línea solo aparecen con `line=`. Ver [markdown-presentation.tsx:147](../src/renderer/editor/markdown-presentation.tsx:147).
- **Inkdrop:** [copiar al pasar el puntero, iconos por lenguaje y números de línea](https://www.inkdrop.app/features).
- **Cambio:** añadir el botón de copiar y los iconos, y una preferencia para mostrar siempre la numeración.

#### INC-16. El corrector ortográfico no ofrece sugerencias

- **Evidencia (Código):** [main.ts:121](../src/main.ts:121) solo crea menú contextual en modo desarrollo. No se usa `dictionarySuggestions` ni `replaceMisspelling`.
- **Cambio:** añadir un menú nativo con sugerencias, cortar, copiar y pegar.
- **Aceptación:** clic derecho sobre una palabra subrayada permite reemplazarla.

#### INC-17. La app usa el menú por defecto de Electron

- **Evidencia (Código):** no se llama a `Menu.setApplicationMenu`.
- **Inkdrop:** menús propios, entre ellos File, Edit, View y Navigate.
- **Cambio:** construir el menú desde el registro de comandos, con los atajos actuales y sin herramientas de desarrollo en producción.

#### INC-18. Las plantillas están incompletas

- **Evidencia (Código):** solo hay una plantilla integrada, en [builtin-templates.ts:5](../src/renderer/templates/builtin-templates.ts:5). Una referencia `book:ID` hace fallar [template-engine.ts:116](../src/renderer/templates/template-engine.ts:116), y `tag:ID` se guarda como nombre de etiqueta.
- **Inkdrop:** [categorías Brainstorming, Debugging, Learning, Planning y Productivity](https://docs.inkdrop.app/reference/note-templates).
- **Cambio:** añadir plantillas propias por categoría, mostrar `description` en el selector y resolver referencias por ID.

#### INC-19. La exportación no cubre todos los casos

- **Evidencia (Código):** [transfer.ts:11](../src/shared/transfer.ts:11) solo define exportar una nota o toda la biblioteca, y [markdown-export.ts:103](../src/main/markdown-export.ts:103) exporta la biblioteca solo en Markdown.
- **Inkdrop:** [nota, notebook o todas las notas, en Markdown o HTML](https://www.inkdrop.app/features).
- **Cambio:** añadir exportación por notebook y por selección, y HTML para conjuntos de notas.

#### INC-20. El catálogo de iconos de notebook es muy reducido

- **Evidencia (Código):** [notebook-icons.ts](../src/shared/notebook-icons.ts) contiene 24 iconos.
- **Inkdrop:** [más de 1.500 iconos Lucide](https://www.inkdrop.app/features).
- **Cambio:** ampliar el catálogo con búsqueda y carga bajo demanda, sin aumentar el bundle inicial.

### P3: ajustes menores

#### INC-21. Los códigos de emoji no se renderizan

- **Evidencia (Sonda):** `:smile:` aparece como texto en el preview. El autocompletado sí inserta el emoji.
- **Cambio:** añadir un plugin remark con `gemoji` que respete el código en línea y los bloques.

#### INC-22. Los atajos con Option pueden fallar en macOS (sin confirmar)

- **Evidencia (Código):** [shortcuts.ts:32](../src/renderer/shortcuts.ts:32) compara `event.key`, y Option puede cambiar ese carácter en macOS. Afecta a `Mod-Alt-Shift-f` y a futuros atajos como Cmd+Alt+K.
- **Cambio:** probarlo con un teclado físico y, si falla, comparar también `event.code`.

#### INC-23. El modelo de datos no es intercambiable con Inkdrop

- **Evidencia (Código):** las diferencias afectan a la importación, la API y la sincronización.

| Campo             | InkNote                         | Inkdrop               |
| ----------------- | ------------------------------- | --------------------- |
| ID de nota        | UUID                            | `note:<id>`           |
| Estado en espera  | `onhold`                        | `onHold`              |
| Etiquetas en nota | Nombres                         | ID `tag:<id>`         |
| Fechas            | ISO 8601                        | Milisegundos Unix     |
| Enlace a nota     | `inknote://note/<id>`           | `inkdrop://note/<id>` |
| Imagen            | `inknote-asset://images/<hash>` | `inkdrop://file:<id>` |

- **Cambio:** mantener el modelo interno y crear un adaptador para FAL-01, FAL-14 y FAL-16.

## Parte 2: funciones sin implementar

La ausencia de estas funciones se comprobó en el código fuente.

### P1: funciones básicas

| ID     | Función                  | Qué ofrece Inkdrop                                                               | Implementación propuesta                                                                                  |
| ------ | ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| FAL-01 | Importación              | Evernote, Apple Notes, Notion, Bear, Markdown y HTML, con subcarpetas e imágenes | Empezar por Markdown y HTML, con carpetas convertidas en notebooks. Después, Evernote `.enex` y el resto. |
| FAL-02 | Historial de revisiones  | Lista, diff, restaurar y deshacer la restauración                                | Los datos ya se guardan en `note_revisions`. Falta el IPC de lectura y un diálogo con diff.               |
| FAL-03 | Gestión de notebooks     | Renombrar, mover y ordenar con arrastre                                          | **Resuelto el 2026-11-18.** Renombrar, mover y ordenar con arrastre o desde el menú contextual.           |
| FAL-04 | Duplicar nota            | Comando `core:duplicate-note` y Cmd/Ctrl+D                                       | **Resuelto el 2026-11-18.** Disponible con Cmd/Ctrl+D, en el menú de la nota y en la lista.               |
| FAL-05 | Mover notas arrastrando  | Arrastrar de la lista a un notebook                                              | **Resuelto el 2026-11-18.** Admite selección múltiple y soltar en «Sin notebook».                         |
| FAL-06 | Actualización automática | Actualización integrada en el instalador                                         | Usar `autoUpdater` en Windows y macOS. macOS exige firma real, y en Linux basta con avisar.               |
| FAL-07 | Enlaces externos a notas | Protocolo `inkdrop://` registrado en el sistema                                  | Registrar `inknote://` y validar la URL. Depende de INC-02.                                               |

### P2: paridad importante

| ID     | Función                        | Qué ofrece Inkdrop                                                         | Implementación propuesta                                                                                                            |
| ------ | ------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| FAL-08 | Esquema de la nota             | Encabezados y tareas con la posición actual resaltada                      | **Resuelto el 2026-11-18.** Panel con la posición actual y fuente `#` en la paleta.                                                 |
| FAL-09 | Buscar en el preview           | Búsqueda también dentro de bloques de código                               | **Resuelto el 2026-11-18.** Cmd/Ctrl+F fuera del editor busca en el preview, también dentro del código.                             |
| FAL-10 | Visor de imágenes              | Se abre con doble clic                                                     | **Resuelto el 2026-11-18.** Se abre con doble clic o Enter, con zoom por botones y teclado.                                         |
| FAL-11 | Pegado inteligente de enlaces  | Pegar URL sobre una selección crea un enlace, con título automático        | **Resuelto el 2026-11-18.** Menú de formato al pegar. El título se pide sólo con la preferencia activa o a petición en cada enlace. |
| FAL-12 | Tema automático claro y oscuro | Sigue la apariencia del sistema                                            | Añadir un tema claro y otro oscuro en preferencias y escuchar `nativeTheme`.                                                        |
| FAL-13 | Archivo `keymap.json`          | Selectores CSS, secuencias, `native!`, `unset!` y `abort!`                 | Cargar y vigilar el archivo, validar con Zod y mostrar los errores en Preferencias.                                                 |
| FAL-14 | Servidor HTTP local            | Puerto 19840, autenticación básica, notas, notebooks, etiquetas y archivos | Desactivado por defecto, solo en loopback y con credenciales en el llavero del sistema.                                             |
| FAL-15 | Servidor MCP                   | Agentes que buscan, leen, crean y actualizan notas                         | Construirlo sobre FAL-14 y conservar cursor e historial al editar la nota abierta.                                                  |
| FAL-16 | Sincronización                 | Servidor propio o CouchDB, con fusión automática de conflictos             | Implementar `SyncAdapter`, notebooks, etiquetas, adjuntos y conflictos. Requiere D-2.                                               |
| FAL-17 | Cifrado de extremo a extremo   | AES-256-GCM con clave derivada por PBKDF2                                  | Cifrar antes de enviar, con la clave en el llavero. Debe llegar junto con FAL-16.                                                   |
| FAL-18 | Plugins                        | `activate`, `deactivate`, comandos, layouts e `ipm`                        | Crear el cargador sobre el manifiesto actual, con permisos limitados. Requiere D-3.                                                 |
| FAL-19 | Script `init.js`               | JavaScript del usuario al arrancar                                         | Ofrecerlo solo con la API de FAL-18, activación explícita y sin acceso a Node.                                                      |
| FAL-20 | Atajos globales y nota rápida  | Mostrar u ocultar la ventana, nota rápida, bandeja del sistema             | Usar `globalShortcut`, `Tray` y una segunda ventana con la misma seguridad.                                                         |
| FAL-21 | Muestras de color              | Muestra junto a `#hex`, `rgb()` y `hsl()` en código en línea               | Añadir un componente en el renderer del preview.                                                                                    |
| FAL-22 | Copiar ID y arrastrar enlaces  | Copiar ID de nota, notebook y etiqueta. Arrastrar una nota como enlace     | Añadir entradas al menú contextual y datos al arrastre.                                                                             |

### P3: ecosistema

| ID     | Función                     | Qué ofrece Inkdrop                                            | Implementación propuesta                                                  |
| ------ | --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FAL-23 | Fragmentos de GitHub        | Código incrustado desde un enlace con rango de líneas         | Solo a petición del usuario, con token en el llavero para repos privados. |
| FAL-24 | Estadísticas de actividad   | Notas y tareas de 52 semanas, con rachas                      | Calcularlas localmente desde `note_revisions`.                            |
| FAL-25 | Asistente de IA en línea    | Clave propia, Anthropic o compatible con OpenAI, y Ollama     | Opcional, con la clave en el llavero y un interruptor global.             |
| FAL-26 | Sugerencias de edición      | Texto fantasma, Tab acepta y Esc descarta                     | Construirlo después de FAL-25, en modo manual por defecto.                |
| FAL-27 | Publicar notas en la web    | Enlace público de lectura                                     | Requiere un servicio externo y una decisión de producto.                  |
| FAL-28 | Captura e integraciones     | Web Clipper, Kindle, Alfred y Raycast                         | Construirlas sobre FAL-14.                                                |
| FAL-29 | Más formatos de instalación | Windows y Linux ARM64, AppImage, Snap, Flathub, zip, Homebrew | Ampliar [forge.config.mts:43](../forge.config.mts:43) y la matriz de CI.  |
| FAL-30 | Redes corporativas          | Proxy, certificados propios y diagnóstico de red              | Hacerlo junto con FAL-16.                                                 |
| FAL-31 | Aplicación móvil            | iOS y Android con el mismo editor                             | Proyecto aparte. Depende de FAL-16.                                       |

## Orden de trabajo recomendado

1. **Escritura y lectura:** INC-16 y FAL-21.
2. **Datos:** FAL-02, FAL-01, INC-19, INC-14 e INC-23.
3. **Integración con el escritorio:** INC-09, INC-10, INC-17, FAL-06, FAL-07, FAL-12, FAL-13 y FAL-20.
4. **Plataforma:** FAL-14, FAL-15, FAL-18, FAL-19, FAL-16 y FAL-17, según D-2 y D-3.
5. **Ecosistema:** el resto de tareas P3.

## Funciones verificadas sin diferencias relevantes

Estas áreas pasaron las pruebas y coinciden con la documentación de Inkdrop:

- **Búsqueda:** calificadores `book:`, `tag:`, `status:`, `title:` y `body:`, frases, exclusiones y ausencia de coincidencia parcial.
- **Organización:** notebooks anidados, vista Detail, cuatro estados con sus atajos, fijado, papelera y 14 colores de etiqueta.
- **Editor:** CodeMirror 6, menú `/`, barra flotante, tablas, Vim, modos de ajuste de línea, múltiples cursores y enlaces `[[`.
- **Preview:** alertas GitHub, tareas interactivas, Mermaid, KaTeX con numeración de ecuaciones, metadatos de bloques de código y `<mark>`.
- **Plantillas:** `_template`, fechas, `{% uuid %}` y bloques de instrucciones.
- **Temas:** tokens de `@inkdropapp/css`, capas `theme.*`, `styles.css` y los temas oficiales Solarized y Kanagawa.
- **Datos:** respaldo continuo con `state`, `data` y `_deleted`, restauración, y exportación de notas a Markdown, HTML y PDF.

Hay una diferencia intencionada: InkNote permite alertas anidadas, que Inkdrop no admite. Ya está documentada en `docs/architecture.md`.
