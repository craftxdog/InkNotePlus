import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { migrations } from './migrations';

interface AppliedMigration {
  version: number;
}

export function openDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    defensive: true,
    enableForeignKeyConstraints: true,
    timeout: 5_000,
  });

  applyMigrations(database);
  return database;
}

export function applyMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS inknote_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  withSqliteWrite(database, () => {
    const appliedVersions = new Set(
      database
        .prepare('SELECT version FROM inknote_schema_migrations')
        .all()
        .map(parseAppliedMigration)
        .map(({ version }) => version),
    );

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      database.exec(migration.sql);
      database
        .prepare(
          'INSERT INTO inknote_schema_migrations (version, applied_at) VALUES (?, ?)',
        )
        .run(migration.version, new Date().toISOString());
    }
  });
}

export function withSqliteWrite<T>(database: DatabaseSync, write: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = write();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function parseAppliedMigration(row: Record<string, unknown>): AppliedMigration {
  const version = row.version;
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new Error('Invalid migration record in the local database.');
  }

  return { version };
}
