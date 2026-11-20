// AppImage packaging for Linux. Tools come from pinned releases and are
// checked by SHA-256 before running, never from the moving "continuous" tag.
// https://github.com/AppImage/appimagetool
// https://github.com/AppImage/type2-runtime
const appimagetool =
  'https://github.com/AppImage/appimagetool/releases/download/1.9.1';
const runtime =
  'https://github.com/AppImage/type2-runtime/releases/download/20251108';

export const appImageTools = {
  x64: {
    machine: 'x86_64',
    appimagetool: {
      url: `${appimagetool}/appimagetool-x86_64.AppImage`,
      sha256:
        'ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0',
    },
    runtime: {
      url: `${runtime}/runtime-x86_64`,
      sha256:
        '2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d',
    },
  },
  arm64: {
    machine: 'aarch64',
    appimagetool: {
      url: `${appimagetool}/appimagetool-aarch64.AppImage`,
      sha256:
        'f0837e7448a0c1e4e650a93bb3e85802546e60654ef287576f46c71c126a9158',
    },
    runtime: {
      url: `${runtime}/runtime-aarch64`,
      sha256:
        '00cbdfcf917cc6c0ff6d3347d59e0ca1f7f45a6df1a428a0d6d8a78664d87444',
    },
  },
};

export function appImageName(version, arch) {
  if (!Object.hasOwn(appImageTools, arch))
    throw new Error(`Unsupported AppImage architecture: ${arch}`);
  return `InkNote-${version}-linux-${arch}.AppImage`;
}

export const desktopEntry = () =>
  [
    '[Desktop Entry]',
    'Type=Application',
    'Name=InkNote',
    'Comment=Notas en Markdown',
    'Exec=InkNote %U',
    'Icon=inknote',
    'Terminal=false',
    'Categories=Office;Utility;',
    'MimeType=x-scheme-handler/inknote;',
    'StartupWMClass=InkNote',
    '',
  ].join('\n');

// Chromium's setuid helper cannot work from the read-only AppImage mount, so
// the sandbox needs unprivileged user namespaces. Ubuntu 24.04+ restricts them
// through AppArmor; only there does the app start without the sandbox. The
// .deb and .rpm packages install the helper and keep the sandbox everywhere.
export const appRunScript = () =>
  [
    '#!/bin/sh',
    'here="$(dirname "$(readlink -f "$0")")"',
    'if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] ||',
    '  [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = 0 ]; then',
    '  set -- --no-sandbox "$@"',
    'fi',
    'exec "$here/usr/lib/inknote/InkNote" "$@"',
    '',
  ].join('\n');
