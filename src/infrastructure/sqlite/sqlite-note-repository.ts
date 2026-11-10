import { randomUUID } from 'node:crypto';
import { noteFilter } from './note-query';
import { compileNoteSearch } from './search-query';
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
import { withSqliteWrite } from './database';
import type { ManageTrashInput } from '../../shared/ipc';
import {
  noteMetadataSchema,
  defaultNoteMetadata,
  type NoteMetadata,
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

    withSqliteWrite(this.database, () => {
      this.insertSnapshot(note);
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

    withSqliteWrite(this.database, () => {
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
        ORDER BY is_pinned DESC, ${input.sort === 'title' ? 'title COLLATE NOCASE,' : ''} updated_at DESC, id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...filter.params, limit, input.offset ?? 0)
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
    const search = compileNoteSearch(input, input.query);

    const rows = this.database
      .prepare(`
        SELECT ${noteColumns}
        FROM notes ${search.join}
        WHERE ${search.sql}
        ORDER BY notes.is_pinned DESC, ${input.sort === 'title' ? 'notes.title COLLATE NOCASE,' : search.fts ? 'bm25(notes_fts),' : ''} notes.updated_at DESC, notes.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...search.params, normalizeLimit(input.limit), input.offset ?? 0)
      .map(parseNoteRow);

    return rows.map(toNote);
  }

  moveToTrash(id: NoteId): Note {
    return withSqliteWrite(this.database, () => {
      const note = this.requireNote(id);
      return note.deletedAt === null
        ? this.writePlacement(
            note,
            note.metadata ?? defaultNoteMetadata,
            new Date().toISOString(),
          )
        : note;
    });
  }

  restore(id: NoteId): Note {
    return withSqliteWrite(this.database, () => {
      const note = this.requireNote(id);
      return note.deletedAt === null
        ? note
        : this.writePlacement(note, note.metadata ?? defaultNoteMetadata, null);
    });
  }

  manageTrash(input: ManageTrashInput): number {
    return withSqliteWrite(this.database, () => {
      if (input.action === 'restore') this.requireNotebook(input.notebookId);
      const ids =
        input.action === 'empty'
          ? this.database
              .prepare('SELECT id FROM notes WHERE deleted_at IS NOT NULL')
              .all()
              .map((row) => readString(row, 'id'))
          : new Set(input.ids);
      const now = new Date().toISOString();
      let affected = 0;
      for (const id of ids) {
        const note = this.findById(id);
        if (!note) continue;
        const metadata = note.metadata ?? defaultNoteMetadata;
        if (input.action === 'trash') {
          if (note.deletedAt !== null) continue;
          this.writePlacement(note, metadata, now);
        } else if (input.action === 'restore') {
          if (note.deletedAt === null) continue;
          this.writePlacement(
            note,
            { ...metadata, notebookId: input.notebookId },
            null,
          );
        } else {
          if (note.deletedAt === null) throw new NoteConflictError(id);
          this.purge(note, now);
        }
        affected++;
      }
      return affected;
    });
  }

  // The caller owns the transaction when changing notes together with notebooks or tags.
  writePlacement(
    current: Note,
    metadata: NoteMetadata,
    deletedAt: string | null,
  ): Note {
    const next: Note = {
      ...current,
      metadata,
      deletedAt,
      updatedAt: new Date().toISOString(),
      revision: current.revision + 1,
    };
    this.database
      .prepare(`
          UPDATE notes
          SET deleted_at = ?, updated_at = ?, revision = ?, metadata_json = ?
          WHERE id = ?
        `)
      .run(
        next.deletedAt,
        next.updatedAt,
        next.revision,
        JSON.stringify(metadata),
        next.id,
      );
    this.insertRevision(next);
    this.syncOutbox.recordNote(next);
    return next;
  }

  private purge(note: Note, now: string): void {
    this.database
      .prepare('DELETE FROM note_revisions WHERE note_id = ?')
      .run(note.id);
    this.database.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
    this.database
      .prepare(
        "DELETE FROM sync_outbox WHERE entity_type = 'note' AND entity_id = ?",
      )
      .run(note.id);
    this.syncOutbox.recordNote({
      ...note,
      deletedAt: now,
      updatedAt: now,
      revision: note.revision + 1,
    });
  }

  private requireNote(id: NoteId): Note {
    const note = this.findById(id);
    if (!note) throw new NoteNotFoundError(id);
    return note;
  }

  findById(id: NoteId): Note | null {
    const row = this.database
      .prepare(`SELECT ${noteColumns} FROM notes WHERE id = ?`)
      .get(id);

    return row ? toNote(parseNoteRow(row)) : null;
  }

  // The caller owns the transaction for the note, revision, and outbox.
  insertSnapshot(note: Note): void {
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
        JSON.stringify(note.metadata ?? defaultNoteMetadata),
      );
    this.insertRevision(note);
    this.syncOutbox.recordNote(note);
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
}

function normalizeLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
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
