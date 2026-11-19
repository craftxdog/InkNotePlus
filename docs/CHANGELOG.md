# Historial de versiones

## 1.4.0 — 2026-11-18

### Añadido

- Importación desde Apple Notes en macOS.
- Las notas se pueden abrir en una ventana propia con Cmd/Ctrl+Mayús+N, y la nota
  rápida usa esa misma ventana.
- Archivos ZIP portables, también para Windows y Linux ARM64.
- Plugins aislados, sin Node, sin red y sin acceso a tus archivos, compatibles con
  parte de la API de Inkdrop: comandos, atajos, notas y notificaciones.
- Script `init.js` opcional, con las mismas limitaciones que un plugin.
- Sincronización con tu propio servidor CouchDB, con cifrado de extremo a extremo.
  Incluye notas, notebooks, etiquetas e imágenes de hasta 4 MB. Si dos equipos
  editan la misma nota, se conservan ambas versiones.
- Proxy configurable y diagnóstico de conexión para la sincronización.
- Kit de Docker para desplegar CouchDB en un servidor propio.
- Asistente de IA opcional para mejorar, corregir, resumir o traducir texto, con
  Anthropic, proveedores compatibles con OpenAI u Ollama. Está desactivado por
  defecto y usa tu propia clave.
- Sugerencias con texto fantasma: Tab las acepta y Esc las descarta.
- Inserción de fragmentos de código desde enlaces de GitHub.
- Servidor local opcional con API HTTP y MCP para que otras aplicaciones y agentes
  de IA trabajen con tus notas. Está desactivado por defecto, solo acepta conexiones
  desde el equipo y exige contraseña.
- Los recortes de Kindle se importan como una nota por libro, y hay un script de
  captura para Raycast y Alfred.
- `keymap.json` permite definir atajos por selector CSS y secuencias, con
  `native!`, `unset!` y `abort!`. Los errores aparecen en Preferencias.
- Los temas pueden seguir la apariencia del sistema.
- Atajos globales, nota rápida e icono en la bandeja, desactivados por defecto.
- Diez plantillas integradas en cinco categorías y todo el catálogo de iconos
  de Lucide para los notebooks.
- Los códigos de emoji como `:smile:` se muestran en el preview y al exportar.
- Preferencias muestra la actividad de 52 semanas y las rachas.
- Se puede copiar el ID de notas y notebooks, y arrastrar una nota al editor para
  insertar su enlace.
- Los enlaces `inknote://note/<id>` abren la nota desde otras apps, tanto con
  InkNote abierto como cerrado.
- Menú propio de la aplicación con Archivo, Edición, Vista, Navegar, Ventana y
  Ayuda, que muestra los atajos personalizados.
- InkNote avisa de nuevas versiones publicadas en GitHub y abre la descarga. La
  comprobación se puede desactivar en Preferencias y no envía datos de las notas.
- El editor, el preview y la exportación comparten 143 gramáticas del catálogo
  oficial de CodeMirror. El autocompletado incluye sus alias y extensiones, con
  carga bajo demanda para Bash, Python, C/C++, Go, Rust, Java y otros lenguajes.
- Los bloques `diff`/`patch` resaltan cambios de Git; `github-actions` utiliza
  YAML. Los lenguajes desconocidos conservan su contenido como texto legible.
- Los bloques de código admiten título, nombre de archivo, línea inicial,
  referencia de commit y enlace HTTP(S) de origen. HTML y PDF conservan las
  cabeceras, la numeración y el resaltado.

- Los notebooks se pueden renombrar, mover a otro notebook y ordenar a mano, con
  arrastre o desde su menú contextual. El orden se conserva en los respaldos.
- Las notas se mueven arrastrándolas a un notebook o a «Sin notebook», también
  con varias seleccionadas.
- Cmd/Ctrl+D duplica la nota. Borrar línea queda disponible sin atajo por defecto.
- Las notas seleccionadas se pueden mover, etiquetar y cambiar de estado en lote.
- Pulsar etiquetas en la lista acumula filtros, y Alt+clic deja solo la pulsada.
- Las notas se ordenan por título, creación o modificación, en ambos sentidos.
- Cmd/Ctrl+K busca comandos, notebooks, etiquetas, encabezados, tareas y temas,
  con los prefijos `>`, `b`, `t`, `#` y `h`.
- El panel Esquema lista encabezados y tareas y resalta la posición actual.
- El preview, HTML y PDF muestran subíndices y superíndices con `<sub>` y `<sup>`.
- Cmd/Ctrl+F fuera del editor busca en la vista previa, incluido el código.
- Las imágenes del preview se amplían con doble clic o Enter.
- Pegar una URL sobre texto seleccionado crea un enlace Markdown.
- Pegar una URL en el cursor ofrece mantenerla, crear un enlace o usar el título
  de la página. El título sólo se consulta con permiso y nunca en redes internas.
- El clic derecho en el editor ofrece sugerencias ortográficas, añadir palabras al
  diccionario, cortar, copiar y pegar.
- Los colores `#hex`, `rgb()` y `hsl()` en código en línea muestran una muestra.
- El historial de revisiones compara versiones, las restaura y permite deshacer
  la restauración.
- Se importan archivos y carpetas Markdown o HTML con sus imágenes, exportaciones
  de Evernote (.enex) y las de Notion y Bear. Las subcarpetas crean notebooks.
- También se importan respaldos de Inkdrop con su jerarquía, etiquetas, estados y
  enlaces internos.
- Notebooks y selecciones de notas se exportan a Markdown o HTML.
- Las imágenes admiten hasta 10 MB y los formatos SVG, HEIC y HEIF. Las etiquetas
  llegan a 64 caracteres y cada nota admite hasta 1000.
- Los bloques de código ofrecen botón de copiar, icono de su familia de lenguaje
  y una preferencia para numerar siempre sus líneas.

### Corregido

- Copiar el enlace de una nota o del cursor funciona aunque el sistema deniegue
  el acceso directo al portapapeles.
- Detail aparece al pasar el puntero o navegar con teclado, sin quedarse
  visible en un notebook previamente seleccionado. Su diseño conserva el
  contorno compacto y evita solaparse con nombres largos.
- El resaltado conserva las etiquetas semánticas de cada gramática, incluidos
  funciones, definiciones, comentarios y cambios diff, con los colores del tema.
- Los bloques TSX utilizan su gramática correspondiente en el preview.
- Cmd+← y Cmd+→ mueven el cursor dentro del editor y de los campos de texto en
  macOS, en lugar de cambiar de nota.
- Abrir InkNote de nuevo con el mismo perfil activa la ventana existente, sin
  iniciar un segundo proceso sobre la misma base de datos.
- Las notas completadas y descartadas se ocultan en Todas las notas, etiquetas y
  notebooks, y sus contadores coinciden. La búsqueda las sigue encontrando.
- Un guion suelto o una comilla sin cerrar ya no vacían los resultados de búsqueda.
- Las notas al pie del preview llevan a su definición y permiten volver al texto.

### Pruebas

- 1165 pruebas automatizadas, lint y TypeScript aprobados.
- QA nativo local completo en macOS Apple Silicon: edición, autoguardado,
  sincronización, respaldos, HTML/PDF, papelera, temas y búsqueda con 3.000 notas.
- Doce lenguajes comprobados en siete temas; 972 mediciones de contraste por
  tema, con un mínimo de 5,03:1 en los bloques evaluados.
- Los paquetes de esta versión se construyen y comprueban en los cuatro
  destinos nativos antes de ofrecer sus artefactos en GitHub Actions.

## 1.3.2 — 2026-11-16

### Corregido

- El autoguardado actualiza la lista actual en segundo plano, evitando mostrar
  su indicador de carga mientras se escribe en notas filtradas u ordenadas.
- El preview alinea su desplazamiento antes de pintar el Markdown actualizado.
  La sincronización espera al documento real de CodeMirror, sin confundir un
  render anterior de React con el texto actual del editor.
- El anclaje usa la letra que produjo el texto del preview, evitando el salto
  de una línea en límites de ajuste de texto y celdas de tablas.
- Los cambios de tamaño y el scroll provocado por el navegador no invierten
  la sincronización ni desplazan el editor mientras se escribe.
- Editar una nota CRLF conserva los diagramas cuando su contenido no cambia.
- Aplicar y revertir formato rápidamente conserva la sincronización aunque
  CodeMirror cree otro documento con el mismo texto.
- Añadidas regresiones de autoguardado y sincronización antes de pintar, además
  de una prueba nativa por fotogramas durante escritura y guardado real.

### Pruebas

- 393 pruebas automatizadas, lint y TypeScript aprobados.
- El paquete de macOS Apple Silicon pasó el QA completo de editor, temas,
  respaldo, exportación, papelera y búsqueda con 3.000 notas.
- Nueve escenarios de escritura en cuatro modos de wrap midieron 1.813
  fotogramas, con una desviación máxima de 0,211 px y sin recargas de la lista,
  reemplazos del editor ni reconstrucciones de diagramas.
- La prueba de formato aplicado y revertido dentro de una misma tarea de
  eventos confirmó que el desplazamiento posterior sigue sincronizado.

## 1.3.1 — 2026-11-16

### Corregido

- La selección del editor respeta el fondo de cada tema, con foco y sin foco,
  en lugar de imponer el lavanda predeterminado de CodeMirror.
- El contraste de texto normal, sintaxis y alertas contempla el fondo de la
  selección, la línea activa y el código en línea.
- Las filas activas, sus etiquetas y las pestañas de Preferencias ajustan el
  texto a su propio fondo. Los temas con `color-mix()`, `oklch()` y colores P3
  se convierten con el motor del navegador.
- El QA nativo cubre selección parcial, múltiple, cambios de tema en vivo y
  temas instalados, además de los siete incluidos.

### Pruebas

- 384 pruebas automatizadas aprobadas.
- El paquete de macOS Apple Silicon pasó el QA de editor, guardado, backups,
  exportación, papelera, búsqueda con 3.000 notas y paneles responsivos.
- La comprobación local de nueve temas reales y un tema de regresión incluye
  4.830 mediciones de contraste, selección de código en línea y las cinco alertas.
- Los instaladores se publican tras aprobar los cuatro destinos nativos en CI.

## 1.3.0 — 2026-11-13

### Añadido y mejorado

- El menú `/` agrupa formato básico, alertas e inserción con separadores, iconos
  SVG y ejemplos de sintaxis. Usa la fuente de la interfaz y los tokens del tema.
- Las alertas anidadas conservan sus colores en editor y preview. Los snippets
  continúan los prefijos de cita y las tareas mantienen su edición y deshacer.
- El corrector de contraste cubre también texto, coincidencias y selección del
  autocompletado, conservando las paletas de los temas.

### Pruebas

- 384 pruebas automatizadas cubren la base existente y las nuevas regresiones.
- El QA nativo verifica el menú y las alertas en siete temas, con teclado,
  ratón, deshacer, contraste y ventanas de 640 y 360 px.
- La publicación conserva la verificación de instalación y uso en macOS Apple
  Silicon, macOS Intel, Windows y Linux antes de ofrecer las descargas.

## 1.2.3 — 2026-11-11

### Publicación

- Incluye las correcciones de recarga, editor, temas y dependencias descritas en
  1.2.2, cuyo build de Linux no pudo completar la instalación de dependencias.
- CI utiliza la réplica HTTPS de kernel.org con verificación de firmas de Ubuntu,
  comprueba los índices y prepara las bibliotecas del runtime antes de construir.
  La instalación del DEB utiliza la misma configuración verificada.
- Se conservan las pruebas de instalación y uso en los cuatro destinos. Los
  paquetes se publican únicamente después de aprobarlas.

## 1.2.2 — 2026-11-11 (sin publicación de paquetes)

El tag se conserva como registro del intento. Los paquetes no se publicaron
porque el runner de Linux falló dos veces al resolver el mirror de Ubuntu.

### Corregido

- La recarga guarda los cambios pendientes y recupera la nota seleccionada,
  su cursor, desplazamiento, búsqueda y contexto de navegación.
- Los botones anterior y siguiente recorren el historial de notas visitadas.
- El editor y la vista previa sincronizan el texto visible de líneas con wrap,
  enlaces largos y fuentes o anchuras diferentes.
- La interfaz espera al tema antes de mostrarse y conserva el color de fondo
  durante la recarga. Si falla la lectura inicial de Preferencias, carga un tema
  básico para mantener visible la aplicación.
- Los temas, etiquetas y Preferencias mejoran su contraste conservando el estilo
  de sus paletas. Solarized Dark mantiene sus colores al compilar el instalador.
- Cmd+/ y Ctrl+/ alternan la biblioteca, incluido el panel de ventanas pequeñas,
  conforme al atajo documentado de Inkdrop.

### Seguridad

- Corregidos los avisos de `glob` y `minimatch` en las dependencias de empaquetado
  de ASAR mediante actualizaciones acotadas y verificadas.

### Pruebas

- Añadidas regresiones para recarga, historial, cursor, alineación del editor,
  recuperación del arranque y conservación de colores en producción.
- La auditoría visual repetible cubre siete temas, catorce colores de etiquetas,
  las seis secciones de Preferencias y cuatro tamaños de ventana.

La sincronización entre dispositivos sigue pendiente. Android requiere una
adaptación móvil y queda fuera de esta publicación de escritorio.
