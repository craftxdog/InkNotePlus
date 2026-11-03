import path from 'node:path';

export const databaseFileName = 'inknote-v2.sqlite';
export const configFileName = 'config.json';

export function getDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, databaseFileName);
}

export function getConfigPath(userDataPath: string): string {
  return path.join(userDataPath, configFileName);
}
