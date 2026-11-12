import path from 'node:path';

export function isExternalForNativeQa(id) {
  // Rolldown also calls this for resolved paths. A Windows drive letter or
  // UNC source path must be bundled, just like an absolute POSIX path.
  return (
    !id.startsWith('.') &&
    !id.startsWith('\0') &&
    !path.posix.isAbsolute(id) &&
    !path.win32.isAbsolute(id)
  );
}
