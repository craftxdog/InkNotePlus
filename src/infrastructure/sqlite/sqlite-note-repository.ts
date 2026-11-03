import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  NoteConflictError,
  NoteNotFoundError,
  type NoteRepository,
} from '../../domain/note-repository';
import type {
  CreateNoteInput,
  ListNotesInput,
  Note,
  NoteId,
  SearchNotesInput,
  UpdateNoteInput,
} from '../../domain/note';
import type { NoteSyncOutbox } from '../../domain/sync';
import { SqliteSyncOutbox } from './sqlite-sync-outbox';
import {
  noteMetadataSchema,
  defaultNoteMetadata,
} from '../../shared/note-metadata';

interface NoteRow {
  id: string;
  title: string;
  body: string;
  isPinned: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  revision: number;
  metadataJson: string;
}

const noteColumns = `
  notes.id,
  notes.title,
  notes.body,
  notes.is_pinned AS isPinned,
  notes.created_at AS createdAt,
  notes.updated_at AS updatedAt,
  notes.deleted_at AS deletedAt,
  notes.revision,
  notes.metadata_json AS metadataJson
`;

type NoteSyncRecorder = Pick<NoteSyncOutbox, 'recordNote'>;

export class SqliteNoteRepository implements NoteRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly syncOutbox: NoteSyncRecorder = new SqliteSyncOutbox(
      database,
    ),
  ) {}

  create(input: CreateNoteInput): Note {
    const now = new Date().toISOString();
    const note: Note = {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
      metadata: input.metadata ?? defaultNoteMetadata,
    };

    this.inTransaction(() => {
      this.requireNotebook(note.metadata?.notebookId);
      this.database
        .prepare(`
          INSERT INTO notes (
            id, title, body, is_pinned, created_at, updated_at, deleted_at, revision, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          note.id,
          note.title,
          note.body,
          Number(note.isPinned),
          note.createdAt,
          note.updatedAt,
          note.deletedAt,
          note.revision,
          JSON.stringify(note.metadata),
        );
      this.insertRevision(note);
      this.syncOutbox.recordNote(note);
    });

    return note;
  }

  update(input: UpdateNoteInput): Note {
    const current = this.findById(input.id);
    if (!current) {
      throw new NoteNotFoundError(input.id);
    }
    if (current.deletedAt !== null) {
      throw new NoteNotFoundError(input.id);
    }
    if (current.revision !== input.expectedRevision) {
      throw new NoteConflictError(input.id);
    }

    const next: Note = {
      ...current,
      title: input.title,
      body: input.body,
      updatedAt: new Date().toISOString(),
      revision: current.revision + 1,
      metadata: input.metadata ?? current.metadata,
      isPinned: input.isPinned ?? current.isPinned,
    };

    this.inTransaction(() => {
      this.requireNotebook(next.metadata?.notebookId);
      const result = this.database
        .prepare(`
          UPDATE notes
          SET title = ?, body = ?, updated_at = ?, revision = ?, metadata_json = ?, is_pinned = ?
          WHERE id = ? AND revision = ? AND deleted_at IS NULL
        `)
        .run(
          next.title,
          next.body,
          next.updatedAt,
          next.revision,
          JSON.stringify(next.metadata),
          Number(next.isPinned),
          next.id,
          input.expectedRevision,
        );

      if (result.changes !== 1) {
        throw new NoteConflictError(input.id);
      }

      this.insertRevision(next);
      this.syncOutbox.recordNote(next);
    });

    return next;
  }

  list(input: ListNotesInput = {}): Note[] {
    const limit = normalizeLimit(input.limit);
    const filter = noteFilter(input);
    const rows = this.database
      .prepare(`
        SELECT ${noteColumns}
        FROM notes
        WHERE ${filter.sql}
        ORDER BY is_pinned DESC, updated_at DESC, id DESC
        LIMIT ?
      `)
      .all(...filter.params, limit)
      .map(parseNoteRow);

    return rows.map(toNote);
  }

  private requireNotebook(id: string | null | undefined): void {
    if (
      id &&
      !this.database.prepare('SELECT 1 FROM notebooks WHERE id = ?').get(id)
    ) {
      throw new Error('Notebook does not exist.');
    }
  }

  search(input: SearchNotesInput): Note[] {
    const filter = noteFilter(input);
    const query = toFtsQuery(input.query);
    if (!query) {
      return [];
    }

    const rows = this.database
      .prepare(`
        SELECT ${noteColumns}
        FROM notes_fts
        INNER JOIN notes ON notes.rowid = notes_fts.rowid
        WHERE notes_fts MATCH ? AND ${filter.sql}
        ORDER BY bm25(notes_fts), notes.updated_at DESC, notes.id DESC
        LIMIT ?
      `)
      .all(query, ...filter.params, normalizeLimit(input.limit))
      .map(parseNoteRow);

    return rows.map(toNote);
  }

  moveToTrash(id: NoteId): Note {
    return this.changeDeletedAt(id, new Date().toISOString());
  }

  restore(id: NoteId): Note {
    return this.changeDeletedAt(id, null);
  }

  private changeDeletedAt(id: NoteId, deletedAt: string | null): Note {
    const current = this.findById(id);
    if (!current) {
      throw new NoteNotFoundError(id);
    }

    const next: Note = {
      ...current,
      deletedAt,
      updatedAt: new Date().toISOString(),
      revision: current.revision + 1,
    };

    this.inTransaction(() => {
      const result = this.database
        .prepare(`
          UPDATE notes
          SET deleted_at = ?, updated_at = ?, revision = ?
          WHERE id = ?
        `)
        .run(next.deletedAt, next.updatedAt, next.revision, next.id);

      if (result.changes !== 1) {
        throw new NoteNotFoundError(id);
      }

      this.insertRevision(next);
      this.syncOutbox.recordNote(next);
    });

    return next;
  }

  private findById(id: NoteId): Note | null {
    const row = this.database
      .prepare(`SELECT ${noteColumns} FROM notes WHERE id = ?`)
      .get(id);

    return row ? toNote(parseNoteRow(row)) : null;
  }

  private insertRevision(note: Note): void {
    this.database
      .prepare(`
        INSERT INTO note_revisions (
          note_id, revision, title, body, deleted_at, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        note.id,
        note.revision,
        note.title,
        note.body,
        note.deletedAt,
        note.updatedAt,
        JSON.stringify(note.metadata ?? defaultNoteMetadata),
      );
  }

  private inTransaction(action: () => void): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      action();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function normalizeLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

function noteFilter(input: ListNotesInput): {
  sql: string;
  params: (string | number)[];
} {
  const clauses = ['(notes.deleted_at IS NOT NULL) = ?'];
  const params: (string | number)[] = [Number(input.trashed ?? false)];
  if (input.notebookId === null)
    clauses.push("json_extract(notes.metadata_json,'$.notebookId') IS NULL");
  if (input.notebookId) {
    clauses.push("json_extract(notes.metadata_json,'$.notebookId') = ?");
    params.push(input.notebookId);
  }
  if (input.status) {
    clauses.push("json_extract(notes.metadata_json,'$.status') = ?");
    params.push(input.status);
  }
  if (input.templates) {
    clauses.push("json_extract(notes.metadata_json,'$.isTemplate') = 1");
  }
  if (input.tag) {
    clauses.push(
      "EXISTS(SELECT 1 FROM json_each(notes.metadata_json,'$.tags') WHERE value = ?)",
    );
    params.push(input.tag);
  }
  return { sql: clauses.join(' AND '), params };
}

function toFtsQuery(value: string): string {
  const terms = value.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return terms
    .slice(0, 10)
    .map((term) => `"${term}"`)
    .join(' AND ');
}

function toNote(row: NoteRow): Note {
  const { metadataJson, ...fields } = row;
  return {
    ...fields,
    isPinned: Boolean(row.isPinned),
    metadata: noteMetadataSchema.parse(JSON.parse(metadataJson)),
  };
}

function parseNoteRow(row: Record<string, unknown>): NoteRow {
  const id = readString(row, 'id');
  const title = readString(row, 'title');
  const body = readString(row, 'body');
  const isPinned = readInteger(row, 'isPinned');
  const createdAt = readString(row, 'createdAt');
  const updatedAt = readString(row, 'updatedAt');
  const deletedAt = readNullableString(row, 'deletedAt');
  const revision = readInteger(row, 'revision');

  if ((isPinned !== 0 && isPinned !== 1) || revision < 1) {
    throw new Error('Invalid note record in the local database.');
  }

  return {
    id,
    title,
    body,
    isPinned,
    createdAt,
    updatedAt,
    deletedAt,
    revision,
    metadataJson: readString(row, 'metadataJson'),
  };
}

function readString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new Error('Invalid note record in the local database.');
  }

  return value;
}

function readNullableString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key];
  if (value === null || typeof value === 'string') {
    return value;
  }

  throw new Error('Invalid note record in the local database.');
}

function readInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Invalid note record in the local database.');
  }

  return value;
}
