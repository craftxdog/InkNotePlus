# Integraciones de InkNote

Activa el servidor en **Preferencias > Integraciones**. Solo acepta conexiones desde
tu equipo y todas las solicitudes necesitan el usuario `inknote` y la contraseña
que aparece en esa pantalla.

## API HTTP

La dirección predeterminada es `http://127.0.0.1:19840`.

| Método   | Ruta          | Acción                                                                        |
| -------- | ------------- | ----------------------------------------------------------------------------- |
| `GET`    | `/`           | Nombre y versión de la app                                                    |
| `GET`    | `/notes`      | Lista notas: `keyword`, `limit`, `skip`, `bookId`, `tag`, `status`, `trashed` |
| `POST`   | `/notes`      | Crea una nota: `title`, `body`, `bookId`, `tags`, `status`, `pinned`          |
| `GET`    | `/notes/{id}` | Lee una nota                                                                  |
| `PATCH`  | `/notes/{id}` | Edita los campos enviados. Con `revision` evita sobrescribir cambios          |
| `DELETE` | `/notes/{id}` | Mueve la nota a la papelera                                                   |
| `GET`    | `/books`      | Lista los notebooks                                                           |
| `GET`    | `/tags`       | Lista las etiquetas                                                           |

Las solicitudes que envían una cabecera `Origin` se rechazan, salvo las de las extensiones
autorizadas, así que las páginas web no pueden usar esta API. La contraseña sigue siendo
obligatoria para todas.

## Agentes de IA (MCP)

InkNote ofrece un servidor MCP en `http://127.0.0.1:19840/mcp`. El botón **Copiar
configuración MCP** de Preferencias genera la configuración para tu cliente.

Las herramientas son `search_notes`, `read_note`, `create_note`, `update_note`,
`list_notebooks` y `list_tags`. Ninguna puede borrar notas.

## Web Clipper

La extensión de [`extensions/web-clipper`](../../extensions/web-clipper) guarda páginas o
fragmentos como notas desde Chrome, Edge, Brave y otros navegadores Chromium. Todavía no
está publicada en las tiendas.

1. Abre `chrome://extensions`, activa el modo desarrollador y elige **Cargar descomprimida**
   con la carpeta `extensions/web-clipper`.
2. En sus opciones, copia el origen `chrome-extension://…`.
3. En InkNote, pégalo en **Preferencias > Integraciones > Extensiones autorizadas**.
4. Vuelve a las opciones, escribe la contraseña del servidor local y pulsa **Probar conexión**.

Para guardar, usa el botón de la extensión o el menú contextual de la página. Las imágenes
remotas quedan enlazadas y la vista previa solo las carga si lo permites.

La API también acepta `POST /clip` con `url`, `title`, `html` y, de forma opcional, `tags`
y `bookId`.

## Raycast

1. Copia [`inknote-capture.sh`](inknote-capture.sh) a tu carpeta de Script Commands.
2. Define `INKNOTE_API_PASSWORD` en el script o en tu entorno.

## Alfred

1. Crea un workflow con una entrada **Keyword** y una acción **Run Script**.
2. Elige `/bin/bash`, pega [`inknote-capture.sh`](inknote-capture.sh) y define
   `INKNOTE_API_PASSWORD` en las variables del workflow.

## Apple Notes

En macOS, usa **Archivo > Importar desde Apple Notes**. El sistema te pedirá permiso la
primera vez. Las notas protegidas con contraseña no se importan.

## Kindle

Conecta el Kindle e importa `documents/My Clippings.txt` desde **Importar archivos**.
InkNote crea una nota por libro con sus subrayados y notas.

## Plugins

Instala un plugin desde **Preferencias > Plugins > Instalar desde una carpeta**. La
carpeta necesita un `package.json` con `name`, `version` y `main`, en formato CommonJS.
Los atajos se leen de `keymaps/*.json`.

Disponible en el objeto global `inkdrop`:

| API                                                                 | Uso                                              |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| `commands.add`, `commands.dispatch`                                 | Registrar y ejecutar comandos                    |
| `notifications.addInfo` y variantes                                 | Mostrar avisos                                   |
| `main.dataStore.getLocalDB()`                                       | Leer y guardar notas, notebooks y etiquetas      |
| `editor.getValue`, `editor.getSelection`, `editor.replaceSelection` | Trabajar con la nota abierta, de forma asíncrona |
| `config.get`, `config.set`                                          | Ajustes durante la sesión                        |

Los plugins no tienen Node, Electron, red ni componentes visuales.
