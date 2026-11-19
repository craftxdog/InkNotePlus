#!/bin/bash
# Crea una nota en InkNote con el texto recibido. La primera línea es el título.
# Sirve como Script Command de Raycast y como acción «Run Script» de Alfred.
#
# @raycast.schemaVersion 1
# @raycast.title Nueva nota en InkNote
# @raycast.mode silent
# @raycast.packageName InkNote
# @raycast.icon 📝
# @raycast.argument1 { "type": "text", "placeholder": "Texto de la nota" }
set -euo pipefail

: "${INKNOTE_API_PASSWORD:?Define INKNOTE_API_PASSWORD con la contraseña de Preferencias > Integraciones}"
port="${INKNOTE_API_PORT:-19840}"
text="${1:-$(cat)}"

json_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '"%s"' "$value"
}

title="${text%%$'\n'*}"
payload="{\"title\":$(json_string "$title"),\"body\":$(json_string "$text"),\"tags\":[\"captura\"]}"

# La contraseña entra por stdin para que no aparezca en la lista de procesos.
config_password="${INKNOTE_API_PASSWORD//\\/\\\\}"
config_password="${config_password//\"/\\\"}"
printf 'user = "inknote:%s"\n' "$config_password" |
  curl --silent --show-error --fail --max-time 10 --config - \
    --header 'Content-Type: application/json' \
    --data-binary "$payload" \
    --output /dev/null \
    "http://127.0.0.1:${port}/notes"
echo "Nota guardada en InkNote"
