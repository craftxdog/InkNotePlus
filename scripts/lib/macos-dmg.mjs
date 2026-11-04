import { cp, mkdir, readlink, stat, symlink } from 'node:fs/promises';
import path from 'node:path';

export function safeFileSegment(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))
    throw new Error(`${field} must be a safe file segment.`);
  return value;
}

export async function stageMacDmg(appBundle, directory, productName) {
  safeFileSegment(productName, 'productName');
  if (!(await stat(path.join(appBundle, 'Contents', 'Info.plist'))).isFile())
    throw new Error('The source is not an application bundle.');
  await mkdir(directory, { recursive: true });
  const app = path.join(directory, `${productName}.app`);
  await cp(appBundle, app, { recursive: true, verbatimSymlinks: true });
  await symlink('/Applications', path.join(directory, 'Applications'), 'dir');
  return { app, directory };
}

export async function verifyMacDmgLayout(directory, productName) {
  if (
    !(
      await stat(
        path.join(directory, `${productName}.app`, 'Contents', 'Info.plist'),
      )
    ).isFile()
  )
    throw new Error('The disk image is missing its application bundle.');
  if (
    (await readlink(path.join(directory, 'Applications'))) !== '/Applications'
  )
    throw new Error('The disk image is missing its Applications shortcut.');
}
