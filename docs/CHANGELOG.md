# Historial de versiones

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
