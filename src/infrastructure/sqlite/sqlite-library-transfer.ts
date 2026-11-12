import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Note } from '../../domain/note';
import { maxTitleLength } from '../../shared/ipc';
import { defaultNoteMetadata } from '../../shared/note-metadata';
import { notebookIconSchema } from '../../shared/notebook-icons';
import type { RestoreSummary } from '../../shared/transfer';
import { tagRecordSchema, type TagRecord } from '../../shared/tags';
import { z } from '../../shared/validation';
import type { SqliteNoteRepository } from './sqlite-note-repository';
import { withSqliteWrite } from './database';

export const notebookRecordSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(80),
    parentId: z.uuid().nullable(),
    createdAt: z.string().datetime(),
    icon: notebookIconSchema,
  })
  .strict();
export type NotebookRecord = z.output<typeof notebookRecordSchema>;

export const noteVersionSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    trashed: z.boolean(),
  })
  .strict();
export type NoteVersion = z.output<typeof noteVersionSchema>;

export const recoveryRecordSchema = z
  .object({
    noteId: z.uuid(),
    sourceKey: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RecoveryRecord = z.output<typeof recoveryRecordSchema>;

export class SqliteLibraryTransfer {
  constructor(
    private readonly database: DatabaseSync,
    private readonly notes: SqliteNoteRepository,
  ) {}

  listNotebooks(): NotebookRecord[] {
    return this.database
      .prepare(`SELECT id, name, parent_id AS parentId, created_at AS createdAt,
        icon FROM notebooks ORDER BY id`)
      .all()
      .map((row) => notebookRecordSchema.parse(row));
  }

  listVersions(): NoteVersion[] {
    return this.database
      .prepare(
        'SELECT id, revision, deleted_at IS NOT NULL AS trashed FROM notes ORDER BY id',
      )
      .all()
      .map((row) =>
        noteVersionSchema.parse({ ...row, trashed: row.trashed === 1 }),
      );
  }

  listTags(): TagRecord[] {
    return this.database
      .prepare('SELECT name, color FROM tags ORDER BY name')
      .all()
      .map((row) => tagRecordSchema.parse(row));
  }

  readNote(id: string): Note | null {
    return this.notes.findById(id);
  }

  listRecoveries(): RecoveryRecord[] {
    return this.database
      .prepare(
        'SELECT note_id AS noteId, source_key AS sourceKey FROM backup_recoveries ORDER BY note_id',
      )
      .all()
      .map((row) => recoveryRecordSchema.parse(row));
  }

  restore(
    notebooks: readonly NotebookRecord[],
    notes: readonly Note[],
    tags: readonly TagRecord[] = [],
    recoveries: readonly RecoveryRecord[] = [],
  ): RestoreSummary {
    const counts: RestoreSummary = { notebooks: 0, notes: 0, copies: 0 };
    const orderedNotebooks = orderNotebooks(notebooks);
    const notebookIds = new Set(notebooks.map(({ id }) => id));
    const incomingNotes = new Map(notes.map((note) => [note.id, note]));
    if (
      incomingNotes.size !== notes.length ||
      new Set(recoveries.map(({ noteId }) => noteId)).size !==
        recoveries.length ||
      recoveries.some(({ noteId }) => !incomingNotes.has(noteId)) ||
      notes.some(
        ({ metadata }) =>
          metadata?.notebookId && !notebookIds.has(metadata.notebookId),
      )
    )
      throw new Error('Invalid backup references.');

    return this.withWriteLock(() => {
      const insertTag = this.database.prepare(
        'INSERT INTO tags (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING',
      );
      for (const { name, color } of tags) insertTag.run(name, color);
      const insertNotebook = this.database.prepare(`
        INSERT INTO notebooks (id, name, parent_id, created_at, icon)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
      `);
      for (const { id, name, parentId, createdAt, icon } of orderedNotebooks) {
        counts.notebooks += Number(
          insertNotebook.run(id, name, parentId, createdAt, icon).changes,
        );
      }
      const rememberRecovery = this.database.prepare(
        'INSERT INTO backup_recoveries (note_id, source_key) VALUES (?, ?) ON CONFLICT(note_id) DO NOTHING',
      );
      const findRecoveries = this.database.prepare(
        'SELECT note_id AS noteId FROM backup_recoveries WHERE source_key = ?',
      );
      for (const note of notes) {
        const current = this.notes.findById(note.id);
        if (!current) {
          this.notes.insertSnapshot(note);
          counts.notes++;
        } else if (noteContent(current) !== noteContent(note)) {
          const sourceKey = createHash('sha256')
            .update(JSON.stringify([note.id, noteContent(note)]))
            .digest('hex');
          const expected = recoveryCopy(note);
          // Check every known copy before reusing a free slot. Deleting an
          // earlier copy must not duplicate a later, unchanged recovery.
          const candidates = new Set([
            expected.id,
            ...findRecoveries
              .all(sourceKey)
              .map((row) =>
                recoveryRecordSchema.shape.noteId.parse(row.noteId),
              ),
            ...recoveries
              .filter((record) => record.sourceKey === sourceKey)
              .map((record) => record.noteId),
          ]);
          const recovered = [...candidates].find((id) => {
            const existing = this.notes.findById(id) ?? incomingNotes.get(id);
            return existing && noteContent(existing) === noteContent(expected);
          });
          if (recovered) {
            if (this.notes.findById(recovered))
              rememberRecovery.run(recovered, sourceKey);
            continue;
          }
          for (let attempt = 0; ; attempt++) {
            const copy = recoveryCopy(note, attempt);
            const existing =
              this.notes.findById(copy.id) ?? incomingNotes.get(copy.id);
            if (!existing) {
              this.notes.insertSnapshot(copy);
              rememberRecovery.run(copy.id, sourceKey);
              counts.copies++;
              break;
            }
            if (noteContent(existing) === noteContent(copy)) break;
          }
        }
      }
      for (const { noteId, sourceKey } of recoveries)
        rememberRecovery.run(noteId, sourceKey);
      return counts;
    });
  }

  withWriteLock<T>(write: () => T): T {
    return withSqliteWrite(this.database, write);
  }
}

// Parents must be imported before their children. Unreachable entries are
// cycles or refer to a notebook absent from the backup.
export function orderNotebooks(
  notebooks: readonly NotebookRecord[],
): NotebookRecord[] {
  const byParent = new Map<string | null, NotebookRecord[]>();
  const ids = new Set<string>();
  for (const notebook of notebooks) {
    if (ids.has(notebook.id)) throw new Error('Duplicate notebook.');
    ids.add(notebook.id);
    const children = byParent.get(notebook.parentId) ?? [];
    children.push(notebook);
    byParent.set(notebook.parentId, children);
  }
  const ordered = [...(byParent.get(null) ?? [])];
  for (const notebook of ordered) {
    for (const child of byParent.get(notebook.id) ?? []) ordered.push(child);
  }
  if (ordered.length !== notebooks.length)
    throw new Error('Invalid notebook hierarchy.');
  return ordered;
}

function noteContent(note: Note): string {
  return JSON.stringify([
    note.title,
    note.body,
    note.isPinned,
    note.deletedAt !== null,
    note.metadata ?? defaultNoteMetadata,
  ]);
}

function recoveryCopy(note: Note, attempt = 0): Note {
  // Preserve existing recovery IDs. If a copy has been edited, find the next
  // stable slot so the backup can be recovered again without losing that edit.
  const identity: (string | number)[] = [
    'inknote-recovery-v1',
    note.id,
    noteContent(note),
  ];
  if (attempt) identity.push(attempt);
  const bytes = createHash('sha256').update(JSON.stringify(identity)).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  const suffix = ' (recuperada)';
  return {
    ...note,
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    title: note.title.slice(0, maxTitleLength - suffix.length) + suffix,
    revision: 1,
  };
}
