# Implementaciones pendientes frente a Inkdrop

**Fecha de la auditoría:** 2026-11-18
**Versión auditada:** InkNote 1.4.0, rama `codex/improve-notebooks-codeblocks`, commit `1a2559d`
**Estado final:** publicado en [InkNote v1.4.0](https://github.com/craftxdog/InkNotePlus/releases/tag/v1.4.0), commit `0f30e72` de `main`
**Último recorrido:** 2026-11-20 sobre InkNote 1.6.0, rama `codex/theme-install-fix` (ver [Recorrido completo del 2026-11-20](#recorrido-completo-del-2026-11-20))
**Referencias:** [inkdrop.app](https://www.inkdrop.app/), [guía de usuario](https://docs.inkdrop.app/start-guide) y [documentación para desarrolladores](https://developers.inkdrop.app/)

## Resumen

La auditoría registró **23 funciones implementadas de forma incorrecta o incompleta** y
**31 funciones sin implementar**, 54 en total. La versión 1.4.0 corrige las 23 incorrectas
y resuelve por completo 24 de las faltantes.

Quedan **7 pendientes**. Cinco están resueltas en parte (FAL-06, FAL-18, FAL-28, FAL-29 y
FAL-30) y dos sin empezar (FAL-27 y FAL-31). Ninguna se puede cerrar sin recursos externos,
salvo FAL-18, cuyo límite es la decisión D-3.

| Prioridad     | Significado                                       | Incorrectas | Faltantes | Total |
| ------------- | ------------------------------------------------- | ----------: | --------: | ----: |
| P0            | Riesgo para el uso diario o los datos (resueltos) |           0 |         0 |     0 |
| P1            | Función básica que el usuario espera              |           0 |         1 |     1 |
| P2            | Paridad importante                                |           0 |         1 |     1 |
| P3            | Ecosistema, integraciones y mejoras               |           0 |         5 |     5 |
| **Pendiente** |                                                   |       **0** |     **7** | **7** |

| Pendiente | Qué falta                                    | Qué se necesita                                |
| --------- | -------------------------------------------- | ---------------------------------------------- |
| FAL-06    | Instalar actualizaciones sin pasos manuales  | Certificados de Apple Developer y de Windows   |
| FAL-18    | Componentes visuales e instalación con `ipm` | Nada: es el límite elegido en D-3              |
| FAL-27    | Enlace público de lectura                    | Un servicio alojado y una decisión de producto |
| FAL-28    | Web Clipper                                  | Publicar la extensión en las tiendas           |
| FAL-29    | Snap y Flathub                               | Cuentas en Snap y Flathub                      |
| FAL-30    | Certificados propios y prueba en red real    | Una red corporativa con proxy para validarlo   |
| FAL-31    | Aplicación móvil                             | Cuentas de Apple y Google y un proyecto aparte |

## Recorrido completo del 2026-11-20

**Motivo:** no se podían instalar temas del catálogo, y se quería saber si Claude puede leer y escribir notas.
**Método:** app empaquetada con perfiles temporales, sin datos reales. Se usaron la interfaz real, el catálogo real de Inkdrop y llamadas MCP por HTTP, y se revisaron capturas de cada pantalla de Preferencias.

### Resultado por área

| Área                                          | Cómo se comprobó                                                                                | Resultado                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Temas del catálogo                            | Instalar desde Preferencias › Temas › Explorar catálogo, y los 20 temas del catálogo por la API | **Fallaba**: ningún tema de Inkdrop 6 se instalaba (INC-26). Corregido: 20 de 20 se instalan y se aplican                 |
| Compartir notas con Claude (MCP)              | Servidor local activado, cliente MCP por HTTP contra la app                                     | Funciona: buscar, leer, crear y editar una nota concreta. Ver [Compartir notas con Claude](#compartir-notas-con-claude)   |
| Preview                                       | Tareas, código, Mermaid, KaTeX, alerta, nota al pie, muestras de color                          | Correcto                                                                                                                  |
| Esquema, buscar en el preview, paleta `Cmd+K` | Interfaz                                                                                        | Correcto: 6 encabezados y tareas, «1 de 1» coincidencias, 218 comandos y prefijo `#`                                      |
| Duplicar, historial, papelera                 | `Cmd+D`, dos ediciones, papelera y restaurar                                                    | Correcto: copia creada, 3 revisiones, nota restaurada                                                                     |
| Actividad, `keymap.json`, plugins, `init.js`  | Preferencias y API                                                                              | Correcto. «1 días» corregido a «1 día» (INC-29)                                                                           |
| Sincronización, IA, GitHub sin configurar     | Estado de cada servicio                                                                         | Correcto: desactivados y sin errores                                                                                      |
| Modos de editor                               | Sólo editor, sólo vista previa, dividido                                                        | Correcto                                                                                                                  |
| Preferencias, 10 secciones                    | Captura de cada una                                                                             | Casillas mal alineadas en Temas, Integraciones, Plugins e IA (INC-27), y campos de atajos sin estilo (INC-28). Corregidos |
| Consola del renderer                          | Errores durante el recorrido                                                                    | Ninguno                                                                                                                   |
| Pruebas automáticas                           | `pnpm run verify` y las tres baterías de escritorio                                             | Aprobadas. Hay dos comprobaciones intermitentes (ver abajo)                                                               |

### Compartir notas con Claude

Ya existe (FAL-15): un servidor MCP local que da a Claude acceso de lectura y escritura a tus notas.

1. En **Preferencias › Integraciones**, activa «Permitir que otras aplicaciones de este equipo accedan a mis notas».
2. Pulsa **Copiar configuración MCP**. Copia la dirección `http://127.0.0.1:19840/mcp` y la cabecera `Authorization` con la contraseña del llavero.
3. En Claude Code, añade ese bloque al `.mcp.json` del proyecto, o regístralo con `claude mcp add-json inknote '<bloque inknote>'`. Claude Desktop necesita un puente local como `mcp-remote` en `claude_desktop_config.json`, porque su configuración local solo arranca servidores por línea de comandos.
4. Pide a Claude, por ejemplo, «busca la nota Lista de compras y añade leche». Usa `search_notes` o `read_note` y después `update_note` con la revisión leída.

| Herramienta                   | Qué hace                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `search_notes`                | Busca por texto, notebook, etiqueta o estado. Sin consulta, devuelve las recientes                |
| `read_note`                   | Lee una nota completa por su ID                                                                   |
| `create_note`                 | Crea una nota                                                                                     |
| `update_note`                 | Edita una nota concreta. Exige la revisión leída, así que no sobrescribe cambios hechos en la app |
| `list_notebooks`, `list_tags` | Lista notebooks y etiquetas                                                                       |

**Comprobado:** inicialización con el protocolo 2025-06-18, 401 sin contraseña, búsqueda, lectura y edición de una nota concreta. Una edición con una revisión antigua se rechaza («La nota cambió»), y el cambio aparece al momento en la app. No hay herramienta de borrado. El servidor solo acepta conexiones desde el propio equipo y viene desactivado por defecto.

**Alcance (desde el 2026-11-20):** en Integraciones, «Notas accesibles» limita el acceso a un notebook con sus sub-notebooks o a una etiqueta. Lo demás no existe para Claude: no aparece al buscar ni listar, y leerlo, editarlo o enviarlo a la papelera responde «no existe». Las notas nuevas se crean dentro del alcance, y no se puede sacar una nota de él. El límite se aplica a toda la API local, no solo al MCP, porque ambos usan la misma contraseña (INC-31).

### Pruebas intermitentes

Dos comprobaciones de las baterías de escritorio fallaron una vez y pasaron al repetirlas. **Resueltas el 2026-11-20:**

- `smoke-theme-selection`: el contraste de las etiquetas bajaba a 3,98. La causa era un **fallo real de accesibilidad**: en la fila bajo el ratón, las etiquetas quedaban por debajo de 4,5:1 (3,99 y 3,95 medidos). La prueba solo lo veía cuando el ratón quedaba sobre una fila (INC-30). Ahora la prueba coloca siempre el ratón sobre una fila con etiquetas antes de medir. Con la versión anterior falla siempre y con la corrección pasa. La auditoría de contraste también tiene en cuenta los fondos de un solo color hechos con degradado.
- `smoke-preview-stability`: medía dentro de su propio `requestAnimationFrame`, que a veces se ejecutaba antes que el de la sincronización de la app y veía una posición que nunca llega a pintarse. Ahora mide en un `ResizeObserver`, que el navegador ejecuta después de todos los `requestAnimationFrame` y justo antes de pintar.
- `smoke-electron` (fuentes de KaTeX): apareció durante la verificación de estas correcciones. `document.fonts.check()` responde al instante, y la fuente podía estar todavía descargándose. Ahora espera con `document.fonts.load()`. Una fuente bloqueada por la CSP sigue haciendo fallar la prueba.

Tras las correcciones, `test:desktop`, `test:desktop:package` y `test:desktop:qa` pasaron en tres rondas seguidas, y la batería de desarrollo tres veces más después de corregir la de KaTeX.

### Qué no se comprobó en este recorrido

- Sincronización con el servidor CouchDB real, la IA con una clave real y plugins publicados de Inkdrop.
- Claude Desktop con `mcp-remote`. El protocolo se probó con un cliente HTTP, y la configuración copiada es la de Claude Code.
- Windows y Linux.

## Resultados de las pruebas

### Verificación final de la versión 1.4.0

| Prueba                                      | Resultado                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm run verify`                           | Aprobado: lint, TypeScript y 1165 pruebas en 144 archivos                |
| `pnpm audit --audit-level high`             | Sin vulnerabilidades                                                     |
| `pnpm run test:desktop`                     | Aprobado cinco veces seguidas                                            |
| `pnpm run test:desktop:package`             | Aprobado                                                                 |
| `pnpm run test:desktop:audit`               | Aprobado, sin problemas de contraste                                     |
| `pnpm run test:desktop:qa`                  | Aprobado                                                                 |
| DMG de Apple Silicon                        | Instalado, abierto y editor comprobado                                   |
| CI de GitHub                                | Quality, instaladores y publicación aprobados                            |
| Descargas publicadas                        | Cinco instaladores y seis ZIP con sumas SHA-256 correctas                |
| ZIP de Apple Silicon descargado de GitHub   | Abre la app y guarda notas                                               |
| Sincronización con un servidor CouchDB real | Dos instancias sincronizadas por HTTPS, sin texto legible en el servidor |
| Plugin hostil contra el aislamiento         | Sin acceso a la app ni a la red                                          |

### Auditoría inicial

| Prueba                                    | Resultado                                            |
| ----------------------------------------- | ---------------------------------------------------- |
| `pnpm run test`                           | Aprobado: 454 pruebas en 78 archivos                 |
| `pnpm run test:desktop:qa`                | Aprobado: 7 de 7 bloques, incluido el de 3.000 notas |
| Sonda de paridad sobre la app empaquetada | 12 diferencias de comportamiento confirmadas         |

Las sondas manejaron la app empaquetada con perfiles temporales y no tocaron datos reales.

### Qué no se pudo comprobar

- **Inkdrop no se ejecutó.** La comparación usa su documentación pública, no la app real.
- **Windows, Linux y macOS Intel no se probaron a mano.** GitHub construyó y verificó sus instaladores, pero nadie abrió la app en esos sistemas.
- **Los atajos con Option se simularon.** No se confirmaron con un teclado físico (INC-22).
- **Apple Notes no se leyó contra una biblioteca real**, para no acceder a notas privadas.
- **El asistente de IA no se usó con una clave real** de un proveedor en la nube.
- **El proxy de sincronización no se probó en una red corporativa.**
- **Ningún plugin publicado de Inkdrop se probó.** Solo plugins escritos para las pruebas.
- **La instalación de temas desde el catálogo en línea no se ejecutó** (`--catalog`).
- **Algunas páginas de Inkdrop devuelven 404:** importación, exportación, historial de revisiones y lista de atajos. Para esas funciones la fuente es [inkdrop.app/features](https://www.inkdrop.app/features).

### Cómo leer la evidencia

- **Sonda:** comportamiento observado en la app empaquetada.
- **Código:** comprobado leyendo el código fuente.

## Decisiones

Las tres decisiones están tomadas.

| ID  | Decisión                       | Opciones                                                                            | Estado                                                                                                                | Afecta         |
| --- | ------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- |
| D-1 | Imágenes remotas en el preview | Mantener el bloqueo actual, cargarlas siempre como Inkdrop, o cargarlas con permiso | **Decidido: con permiso.** Bloqueadas por defecto. Se permiten por nota o para todas en Preferencias, solo por HTTPS. | Preview        |
| D-2 | Protocolo de sincronización    | Compatible con CouchDB como Inkdrop, o propio sobre el `sync_outbox` existente      | **Decidido: CouchDB**, con cifrado de extremo a extremo obligatorio.                                                  | FAL-16, FAL-17 |
| D-3 | Compatibilidad de plugins      | API compatible con plugins de Inkdrop, o API propia con permisos limitados          | **Decidido: compatibilidad parcial sin Node.** Los plugins se ejecutan aislados, sin red ni acceso a archivos.        | FAL-18, FAL-19 |

## Diferencias técnicas

| Área           | Inkdrop                                 | InkNote                                       | Valoración                                             |
| -------------- | --------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Escritorio     | Electron                                | Electron 45                                   | Alineado                                               |
| Interfaz       | React con Redux                         | React 19 con Zustand                          | Diferencia deliberada y documentada                    |
| Editor         | CodeMirror 6                            | CodeMirror 6                                  | Alineado                                               |
| Markdown       | unified 10, remark 14, remark-rehype 10 | unified 11, remark-parse 11, remark-rehype 11 | Los plugins de Inkdrop pueden no ser compatibles (D-3) |
| Datos          | PouchDB con índice SQLite               | SQLite con `node:sqlite`                      | Diferencia deliberada                                  |
| Búsqueda       | SQLite FTS5 con ranking                 | SQLite FTS5 con `bm25`                        | Alineado                                               |
| Sincronización | CouchDB, `_rev`, `_changes`             | CouchDB, `_changes`, `_bulk_docs`, cifrado    | Alineado, con cifrado obligatorio                      |
| Atajos         | `keymap.json` con selectores CSS        | `keymap.json` y sustituciones en Preferencias | Alineado                                               |
| Temas          | `@inkdropapp/css`, capas `theme.*`      | Los mismos tokens y capas                     | Alineado                                               |
| Extensiones    | `activate(env)`, `ipm`, `init.js`       | Plugins e `init.js` aislados, sin Node        | Parcial por diseño (FAL-18, D-3)                       |

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

**Estado: resuelto el 2026-11-18.** Los comandos usan los ID de Inkdrop y los atajos guardados con los nombres antiguos siguen funcionando.

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

**Estado: resuelto el 2026-11-18.** Insertar enlace, mover notas y abrir una nota en una ventana separada ya tienen atajo.

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

**Estado: resuelto el 2026-11-18.** Etiquetas de hasta 64 caracteres y 1000 por nota, e imágenes de hasta 10 MB en PNG, JPEG, GIF, WebP, SVG saneado y HEIC o HEIF. HEIC se convierte a JPEG y sólo está disponible en macOS.

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

**Estado: resuelto el 2026-11-18.** El clic derecho ofrece sugerencias, añadir al diccionario, cortar, copiar y pegar. El reemplazo se comprobó con CodeMirror en Electron, pero el menú nativo no se pulsó de forma automatizada.

- **Evidencia (Código):** [main.ts:121](../src/main.ts:121) solo crea menú contextual en modo desarrollo. No se usa `dictionarySuggestions` ni `replaceMisspelling`.
- **Cambio:** añadir un menú nativo con sugerencias, cortar, copiar y pegar.
- **Aceptación:** clic derecho sobre una palabra subrayada permite reemplazarla.

#### INC-17. La app usa el menú por defecto de Electron

**Estado: resuelto el 2026-11-18.** Menús Archivo, Edición, Vista, Navegar, Ventana y Ayuda, creados desde el registro de comandos y con los atajos personalizados. Las herramientas de desarrollo sólo aparecen en modo desarrollo. Las pruebas cubren la plantilla y el envío de comandos, pero el menú nativo no se pulsó de forma automatizada.

- **Evidencia (Código):** no se llama a `Menu.setApplicationMenu`.
- **Inkdrop:** menús propios, entre ellos File, Edit, View y Navigate.
- **Cambio:** construir el menú desde el registro de comandos, con los atajos actuales y sin herramientas de desarrollo en producción.

#### INC-18. Las plantillas están incompletas

**Estado: resuelto el 2026-11-18.** Hay diez plantillas en cinco categorías, con descripción y búsqueda, y las referencias `book:ID` y `tag:ID` se resuelven.

- **Evidencia (Código):** solo hay una plantilla integrada, en [builtin-templates.ts:5](../src/renderer/templates/builtin-templates.ts:5). Una referencia `book:ID` hace fallar [template-engine.ts:116](../src/renderer/templates/template-engine.ts:116), y `tag:ID` se guarda como nombre de etiqueta.
- **Inkdrop:** [categorías Brainstorming, Debugging, Learning, Planning y Productivity](https://docs.inkdrop.app/reference/note-templates).
- **Cambio:** añadir plantillas propias por categoría, mostrar `description` en el selector y resolver referencias por ID.

#### INC-19. La exportación no cubre todos los casos

**Estado: resuelto el 2026-11-18.** Se exportan notebooks, selecciones y toda la biblioteca en Markdown o HTML. El selector nativo de carpetas no se pulsó de forma automatizada.

- **Evidencia (Código):** [transfer.ts:11](../src/shared/transfer.ts:11) solo define exportar una nota o toda la biblioteca, y [markdown-export.ts:103](../src/main/markdown-export.ts:103) exporta la biblioteca solo en Markdown.
- **Inkdrop:** [nota, notebook o todas las notas, en Markdown o HTML](https://www.inkdrop.app/features).
- **Cambio:** añadir exportación por notebook y por selección, y HTML para conjuntos de notas.

#### INC-20. El catálogo de iconos de notebook es muy reducido

**Estado: resuelto el 2026-11-18.** El selector busca en todo el catálogo de Lucide y cada icono se carga bajo demanda.

- **Evidencia (Código):** [notebook-icons.ts](../src/shared/notebook-icons.ts) contiene 24 iconos.
- **Inkdrop:** [más de 1.500 iconos Lucide](https://www.inkdrop.app/features).
- **Cambio:** ampliar el catálogo con búsqueda y carga bajo demanda, sin aumentar el bundle inicial.

### P3: ajustes menores

#### INC-21. Los códigos de emoji no se renderizan

**Estado: resuelto el 2026-11-18.** Los códigos de emoji se muestran en el preview y en la exportación, sin tocar el código.

- **Evidencia (Sonda):** `:smile:` aparece como texto en el preview. El autocompletado sí inserta el emoji.
- **Cambio:** añadir un plugin remark con `gemoji` que respete el código en línea y los bloques.

#### INC-22. Los atajos con Option pueden fallar en macOS (sin confirmar)

**Estado: resuelto el 2026-11-18.** En macOS se compara también la tecla física. Se comprobó con eventos simulados, no con un teclado físico.

- **Evidencia (Código):** [shortcuts.ts:32](../src/renderer/shortcuts.ts:32) compara `event.key`, y Option puede cambiar ese carácter en macOS. Afecta a `Mod-Alt-Shift-f` y a futuros atajos como Cmd+Alt+K.
- **Cambio:** probarlo con un teclado físico y, si falla, comparar también `event.code`.

#### INC-23. El modelo de datos no es intercambiable con Inkdrop

**Estado: resuelto para la importación el 2026-11-18.** Un adaptador lee el modelo documentado de Inkdrop e importa sus respaldos. No se probó con un respaldo real de Inkdrop. La conversión de salida se hará con FAL-14 y FAL-16, que son quienes la necesitan.

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

#### INC-24. Los paneles suben y bajan al desplazar notas largas

**Estado: resuelto el 2026-11-19.** En ambos sentidos, el panel que sigue interpola entre las letras que rodean la fila de referencia y los bordes medidos de los bloques intermedios. Medido con la app empaquetada sobre una nota sintética de 1104 líneas y dos notas reales con tablas y diagramas.

- **Evidencia (Sonda):** al desplazar el editor, el preview retrocedía en cada línea en blanco o bloque (262 retrocesos y un salto de 171 px en la nota sintética).
- **Causa:** sin una letra en la fila de referencia, el preview saltaba al mapa de bloques y luego volvía a la letra anterior. Además, cada frame recorría todos los textos del preview.
- **Cambio:** interpolación continua entre letras y bordes de bloque, y una lista ordenada de rangos de texto que se reutiliza mientras no cambie la medición.
- **Aceptación:** ningún panel retrocede al desplazar el otro, en ambos sentidos, y avanza sin saltos salvo al llegar al final.

#### INC-25. Escribir en notas largas se vuelve lento

**Estado: resuelto el 2026-11-19.** El preview analiza cada bloque de primer nivel por separado y solo vuelve a procesar el que cambia. Medido con la app empaquetada escribiendo 57 teclas a mitad de nota.

- **Evidencia (Sonda):** en una nota de 1104 líneas, cada tecla costaba 51 ms de hilo principal, frente a 10 ms en una nota corta. El 90 % era JavaScript.
- **Causa:** [markdown-preview.tsx](../src/renderer/editor/markdown-preview.tsx) volvía a analizar con micromark y a convertir a HTML toda la nota en cada cambio.
- **Cambio:** división en bloques (`markdown-blocks.ts`), un componente memoizado por bloque, líneas absolutas con `remarkLineOffset` y claves que sobreviven a las ediciones.
- **Aceptación:** el HTML es idéntico al de la nota completa. En la nota de 1104 líneas cada tecla cuesta 18 ms, y en las notas reales de prueba entre 14 y 16 ms (antes 18 ms).

#### INC-26. Los temas del catálogo no se pueden instalar

**Estado: resuelto el 2026-11-20.** Los 20 temas del catálogo de Inkdrop 6 se instalan y se aplican. Comprobado con la interfaz real y la red real, y por la API uno por uno.

- **Evidencia (Sonda):** al instalar `nord` desde Preferencias › Temas › Explorar catálogo aparecía «El paquete no contiene un tema CSS válido o usa recursos no admitidos». Solo se instalaba el 0 % de los temas que no venían incluidos.
- **Causas:**
  - [theme-service.ts](../src/main/themes/theme-service.ts) quitaba siempre la primera carpeta del archivo (`strip: 1`, la convención de `npm pack`). Inkdrop 6 publica los paquetes con `package.json` en la raíz, así que el manifiesto y los estilos desaparecían.
  - [theme-files.ts](../src/main/themes/theme-files.ts) rechazaba las imágenes `data:image/svg+xml` con las que `nord` dibuja las pestañas.
  - Los paquetes de Catppuccin incluyen una captura de 6 a 7 MB para su README. Superar el límite de 5 MB por archivo abortaba la instalación a medias, y la limpieza fallaba con `ENOTEMPTY` («No se pudo completar la operación»).
- **Cambio:** detectar si el archivo tiene carpeta raíz antes de extraer, aceptar URI `data:` de imagen (la CSP ya los permite y un SVG como imagen no ejecuta código), y omitir los archivos grandes en lugar de abortar. Un estilo omitido sigue haciendo fallar la instalación. Además, los temas instalados se muestran con un nombre legible («Catppuccin Mocha»).
- **Aceptación:** 20 de 20 temas del catálogo se instalan, y `nord` y `catppuccin-mocha` cambian la interfaz, el editor y la vista previa al instalarse.
- **Nota:** sin la cabecera `X-CLIENT-VERSION: 6.0.0`, el catálogo solo devuelve temas de Inkdrop 4 y 5 (`ui`, `syntax`, `preview`). Usan LESS o clases de CodeMirror 5 y su almacenamiento rechaza las descargas (403). La app envía la cabecera y solo ve temas de Inkdrop 6, que son los compatibles.

#### INC-27. Las casillas de Temas, Integraciones, Plugins e IA se ven descolocadas

**Estado: resuelto el 2026-11-20.**

- **Evidencia (Sonda):** «Seguir la apariencia del sistema», «Permitir que otras aplicaciones…», «Activar el asistente de IA» y las casillas de plugins aparecían centradas sobre su texto, no a su izquierda.
- **Causa:** esos componentes usaban la clase `setting-toggle`, pero la hoja de estilos define `settings-toggle`.
- **Cambio:** usar la clase correcta.

#### INC-28. Los campos de atajos no tienen el estilo de los demás campos

**Estado: resuelto el 2026-11-20.**

- **Evidencia (Sonda):** en Preferencias › Atajos, los campos tenían un borde fino y no tenían relleno.
- **Causa:** el campo no declaraba `type="text"`, y el estilo común solo se aplica a `input[type='text']`.
- **Cambio:** declarar el tipo.

#### INC-29. La racha de actividad dice «1 días»

**Estado: resuelto el 2026-11-20.** Ahora dice «1 día» y, a partir de 2, «días».

#### INC-30. Las etiquetas pierden contraste en la fila bajo el ratón

**Estado: resuelto el 2026-11-20.**

- **Evidencia (Sonda):** en InkNote Light, las etiquetas de una fila bajo el ratón tenían un contraste de 3,99 (azul) y 3,95 (rojo), por debajo de 4,5:1. En la fila activa era de 4,72 y en una fila normal de 5,55.
- **Causa:** el fondo de la etiqueta es semitransparente y se mezclaba con el fondo más oscuro de la fila bajo el ratón.
- **Cambio:** en esas filas, la etiqueta se compone sobre el fondo de la lista, como en una fila normal. La fila activa conserva sus colores, que ya cumplían.
- **Aceptación:** la prueba de contraste coloca siempre el ratón sobre una fila con etiquetas. Falla con la versión anterior y pasa con la corrección en los siete temas.

#### INC-31. Claude ve todas las notas

**Estado: resuelto el 2026-11-20.**

- **Evidencia (Código):** el servidor MCP y la API local daban acceso a toda la biblioteca a cualquier aplicación con la contraseña.
- **Cambio:** en Preferencias › Integraciones, «Notas accesibles» permite elegir todas las notas, un notebook con sus sub-notebooks o una etiqueta. [notes-scope.ts](../src/main/local-api/notes-scope.ts) aplica el límite en la consulta, así que la paginación sigue siendo correcta.
  - Fuera del alcance todo responde «no existe».
  - Notebooks, etiquetas y conteos solo muestran lo que está dentro.
  - Las notas nuevas entran en el alcance y no se pueden sacar de él.
  - Si el notebook elegido se borra, no se muestra nada.
- **Aceptación:** pruebas de integración con una base de datos real para la API REST y para las herramientas MCP, en los tres modos.

## Parte 2: funciones sin implementar

La ausencia de estas funciones se comprobó en el código fuente.

### P1: funciones básicas

| ID     | Función                  | Qué ofrece Inkdrop                                                               | Implementación propuesta                                                                                                                                                                                                                                         |
| ------ | ------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FAL-01 | Importación              | Evernote, Apple Notes, Notion, Bear, Markdown y HTML, con subcarpetas e imágenes | **Resuelto el 2026-11-18.** Importa Markdown, HTML, carpetas, imágenes, Evernote `.enex`, Notion, Bear y Apple Notes en macOS. Las notas bloqueadas de Apple Notes no se importan. Esa lectura no se probó contra una biblioteca real de Notas.                  |
| FAL-02 | Historial de revisiones  | Lista, diff, restaurar y deshacer la restauración                                | **Resuelto el 2026-11-18.** Lista de versiones, diff, restaurar y deshacer la restauración.                                                                                                                                                                      |
| FAL-03 | Gestión de notebooks     | Renombrar, mover y ordenar con arrastre                                          | **Resuelto el 2026-11-18.** Renombrar, mover y ordenar con arrastre o desde el menú contextual.                                                                                                                                                                  |
| FAL-04 | Duplicar nota            | Comando `core:duplicate-note` y Cmd/Ctrl+D                                       | **Resuelto el 2026-11-18.** Disponible con Cmd/Ctrl+D, en el menú de la nota y en la lista.                                                                                                                                                                      |
| FAL-05 | Mover notas arrastrando  | Arrastrar de la lista a un notebook                                              | **Resuelto el 2026-11-18.** Admite selección múltiple y soltar en «Sin notebook».                                                                                                                                                                                |
| FAL-06 | Actualización automática | Actualización integrada en el instalador                                         | **Resuelto en parte el 2026-11-18.** Busca versiones en GitHub al iniciar y cada día, avisa y abre la descarga. La opción se desactiva en Preferencias. Falta la instalación automática, que exige firmar los instaladores y publicar un canal de actualización. |
| FAL-07 | Enlaces externos a notas | Protocolo `inkdrop://` registrado en el sistema                                  | **Resuelto el 2026-11-18.** `inknote://note/<id>` abre la nota con la app abierta o cerrada. Las URL no válidas se ignoran.                                                                                                                                      |

### P2: paridad importante

| ID     | Función                        | Qué ofrece Inkdrop                                                         | Implementación propuesta                                                                                                                                                                                                                                                                     |
| ------ | ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FAL-08 | Esquema de la nota             | Encabezados y tareas con la posición actual resaltada                      | **Resuelto el 2026-11-18.** Panel con la posición actual y fuente `#` en la paleta.                                                                                                                                                                                                          |
| FAL-09 | Buscar en el preview           | Búsqueda también dentro de bloques de código                               | **Resuelto el 2026-11-18.** Cmd/Ctrl+F fuera del editor busca en el preview, también dentro del código.                                                                                                                                                                                      |
| FAL-10 | Visor de imágenes              | Se abre con doble clic                                                     | **Resuelto el 2026-11-18.** Se abre con doble clic o Enter, con zoom por botones y teclado.                                                                                                                                                                                                  |
| FAL-11 | Pegado inteligente de enlaces  | Pegar URL sobre una selección crea un enlace, con título automático        | **Resuelto el 2026-11-18.** Menú de formato al pegar. El título se pide sólo con la preferencia activa o a petición en cada enlace.                                                                                                                                                          |
| FAL-12 | Tema automático claro y oscuro | Sigue la apariencia del sistema                                            | **Resuelto el 2026-11-18.** Preferencias permite seguir la apariencia del sistema con un tema claro y otro oscuro.                                                                                                                                                                           |
| FAL-13 | Archivo `keymap.json`          | Selectores CSS, secuencias, `native!`, `unset!` y `abort!`                 | **Resuelto el 2026-11-18.** `keymap.json` admite selectores, secuencias, `native!`, `unset!` y `abort!`, se recarga al guardar y muestra sus errores en Preferencias.                                                                                                                        |
| FAL-14 | Servidor HTTP local            | Puerto 19840, autenticación básica, notas, notebooks, etiquetas y archivos | **Resuelto el 2026-11-18.** API HTTP desactivada por defecto, solo en `127.0.0.1`, con contraseña en el llavero del sistema. Ofrece notas, notebooks y etiquetas. No expone archivos adjuntos.                                                                                               |
| FAL-15 | Servidor MCP                   | Agentes que buscan, leen, crean y actualizan notas                         | **Resuelto el 2026-11-18.** Servidor MCP en `/mcp` para buscar, leer, crear y editar notas, sin herramientas de borrado. Al editar la nota abierta se conservan el cursor y el historial.                                                                                                    |
| FAL-16 | Sincronización                 | Servidor propio o CouchDB, con fusión automática de conflictos             | **Resuelto el 2026-11-18.** Sincroniza notas, notebooks, etiquetas e imágenes de hasta 4 MB con un servidor CouchDB. En un conflicto gana la versión más reciente y la otra se conserva como copia. El kit de `docs/deploy/couchdb` se desplegó y probó en un servidor real.                 |
| FAL-17 | Cifrado de extremo a extremo   | AES-256-GCM con clave derivada por PBKDF2                                  | **Resuelto el 2026-11-18.** Todo se cifra con AES-256-GCM antes de salir del equipo, con una clave derivada por PBKDF2. El servidor nunca recibe la frase de cifrado.                                                                                                                        |
| FAL-18 | Plugins                        | `activate`, `deactivate`, comandos, layouts e `ipm`                        | **Resuelto en parte el 2026-11-18.** Los plugins se ejecutan aislados, sin Node ni red, con `activate`, `deactivate`, comandos, atajos, notas y notificaciones. No admite componentes visuales (`layouts`), plugins que usen Node o Electron, ni la instalación desde el catálogo con `ipm`. |
| FAL-19 | Script `init.js`               | JavaScript del usuario al arrancar                                         | **Resuelto el 2026-11-18.** `init.js` se activa de forma explícita y se ejecuta con las mismas limitaciones que un plugin.                                                                                                                                                                   |
| FAL-20 | Atajos globales y nota rápida  | Mostrar u ocultar la ventana, nota rápida, bandeja del sistema             | **Resuelto el 2026-11-18.** Hay atajos globales, bandeja del sistema y nota rápida en su propia ventana, todos desactivados por defecto.                                                                                                                                                     |
| FAL-21 | Muestras de color              | Muestra junto a `#hex`, `rgb()` y `hsl()` en código en línea               | **Resuelto el 2026-11-18.** Disponible en el preview y en la exportación a HTML y PDF.                                                                                                                                                                                                       |
| FAL-22 | Copiar ID y arrastrar enlaces  | Copiar ID de nota, notebook y etiqueta. Arrastrar una nota como enlace     | **Resuelto el 2026-11-18.** Copia el ID de notas y notebooks y el nombre de etiquetas. Arrastrar una nota al editor inserta su enlace.                                                                                                                                                       |

### P3: ecosistema

| ID     | Función                     | Qué ofrece Inkdrop                                            | Implementación propuesta                                                                                                                                                                                                                                           |
| ------ | --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FAL-23 | Fragmentos de GitHub        | Código incrustado desde un enlace con rango de líneas         | **Resuelto el 2026-11-18.** Inserta un bloque de código desde un enlace de GitHub con rango de líneas, solo a petición, con token opcional en el llavero.                                                                                                          |
| FAL-24 | Estadísticas de actividad   | Notas y tareas de 52 semanas, con rachas                      | **Resuelto el 2026-11-18.** Preferencias muestra 52 semanas de actividad y las rachas, calculadas en el equipo.                                                                                                                                                    |
| FAL-25 | Asistente de IA en línea    | Clave propia, Anthropic o compatible con OpenAI, y Ollama     | **Resuelto el 2026-11-18.** Asistente opcional con Anthropic, proveedores compatibles con OpenAI y Ollama. La clave queda en el llavero y nunca llega a la interfaz. No se probó con una clave real de un proveedor.                                               |
| FAL-26 | Sugerencias de edición      | Texto fantasma, Tab acepta y Esc descarta                     | **Resuelto el 2026-11-18.** Texto fantasma manual por defecto y automático si se activa. Tab acepta y Esc descarta.                                                                                                                                                |
| FAL-27 | Publicar notas en la web    | Enlace público de lectura                                     | Requiere un servicio externo y una decisión de producto.                                                                                                                                                                                                           |
| FAL-28 | Captura e integraciones     | Web Clipper, Kindle, Alfred y Raycast                         | **Resuelto en la rama `codex/remote-images-clipper`.** Importa recortes de Kindle, incluye un script para Raycast y Alfred y una extensión Web Clipper para navegadores Chromium, probada con Brave. Falta publicarla en las tiendas.                              |
| FAL-29 | Más formatos de instalación | Windows y Linux ARM64, AppImage, Snap, Flathub, zip, Homebrew | **Resuelto en parte.** La versión 1.4.0 publica ZIP para macOS, Windows y Linux, incluidos Windows y Linux ARM64, e incluye una plantilla de Homebrew. Desde el 2026-11-20 cada versión publica también AppImage para Linux x64 y ARM64. Faltan Snap y Flathub.    |
| FAL-30 | Redes corporativas          | Proxy, certificados propios y diagnóstico de red              | **Resuelto en parte el 2026-11-18.** La sincronización usa el proxy del sistema o uno propio, confía en los certificados del sistema e incluye un diagnóstico de conexión. El proxy no se probó en una red real y no se pueden importar certificados desde la app. |
| FAL-31 | Aplicación móvil            | iOS y Android con el mismo editor                             | Proyecto aparte. Depende de FAL-16.                                                                                                                                                                                                                                |

## Siguientes pasos

1. **Distribución:** firmar los instaladores para cerrar FAL-06 y publicar AppImage, Snap y Flathub (FAL-29).
2. **Captura:** publicar el Web Clipper en las tiendas (FAL-28).
3. **Validación:** probar Windows, Linux, el proxy corporativo y Apple Notes con datos reales.
4. **Producto:** decidir la publicación web (FAL-27) y la app móvil (FAL-31).
5. ~~**Privacidad con Claude:** permitir que el servidor MCP solo vea un notebook o una etiqueta elegidos.~~ Resuelto el 2026-11-20 (INC-31).

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
