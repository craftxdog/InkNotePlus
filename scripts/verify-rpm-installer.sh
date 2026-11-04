#!/usr/bin/env bash
# Run only inside the disposable Fedora container in installers.yml.
set -euo pipefail
test -f /run/.containerenv || test -f /.dockerenv
mapfile -t packages < <(find out/make/rpm -name '*.rpm')
test "${#packages[@]}" -eq 1
dnf install --assumeyes nodejs xorg-x11-server-Xvfb liberation-sans-fonts liberation-mono-fonts "./${packages[0]}"
rpm --query inknote
useradd --create-home inknote
Xvfb :99 -screen 0 1600x1000x24 &
display_process=$!
trap 'kill "$display_process" 2>/dev/null || true' EXIT
export DISPLAY=:99
for attempt in {1..50}; do
  test -S /tmp/.X11-unix/X99 && break
  sleep 0.1
done
test -S /tmp/.X11-unix/X99
runuser --user inknote -- node scripts/smoke-electron.mjs --app-path=/usr/bin/inknote
