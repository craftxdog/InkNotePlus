export interface SqliteMigration {
  version: number;
  sql: string;
}

export const migrations: readonly SqliteMigration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE notes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
      ) STRICT;

      CREATE INDEX notes_active_updated_idx
        ON notes (updated_at DESC, id DESC)
        WHERE deleted_at IS NULL;

      CREATE TABLE note_revisions (
        note_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (note_id, revision),
        FOREIGN KEY (note_id) REFERENCES notes(id)
      ) STRICT;

      CREATE VIRTUAL TABLE notes_fts USING fts5(
        title,
        body,
        content = 'notes',
        content_rowid = 'rowid'
      );

      CREATE TRIGGER notes_after_insert
      AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts (rowid, title, body)
        VALUES (new.rowid, new.title, new.body);
      END;

      CREATE TRIGGER notes_after_delete
      AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts (notes_fts, rowid, title, body)
        VALUES ('delete', old.rowid, old.title, old.body);
      END;

      CREATE TRIGGER notes_after_update
      AFTER UPDATE OF title, body ON notes BEGIN
        INSERT INTO notes_fts (notes_fts, rowid, title, body)
        VALUES ('delete', old.rowid, old.title, old.body);
        INSERT INTO notes_fts (rowid, title, body)
        VALUES (new.rowid, new.title, new.body);
      END;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE sync_local_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        device_id TEXT NOT NULL UNIQUE,
        next_sequence INTEGER NOT NULL CHECK (next_sequence >= 0)
      ) STRICT;

      CREATE TABLE sync_outbox (
        operation_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'notebook', 'tag')),
        entity_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('upsert', 'tombstone')),
        payload_json TEXT,
        revision INTEGER NOT NULL CHECK (revision > 0),
        origin_device_id TEXT NOT NULL,
        origin_sequence INTEGER NOT NULL CHECK (origin_sequence >= 0),
        occurred_at TEXT NOT NULL,
        acknowledged_at TEXT,
        UNIQUE (origin_device_id, origin_sequence),
        CHECK (
          (kind = 'upsert' AND payload_json IS NOT NULL) OR
          (kind = 'tombstone' AND payload_json IS NULL)
        )
      ) STRICT;

      CREATE INDEX sync_outbox_pending_idx
        ON sync_outbox (acknowledged_at, origin_sequence)
        WHERE acknowledged_at IS NULL;

      CREATE TABLE sync_checkpoints (
        target_id TEXT PRIMARY KEY NOT NULL,
        cursor TEXT,
        last_applied_operation_id TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
];
