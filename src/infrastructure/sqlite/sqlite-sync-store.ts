import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Note } from '../../domain/note';
import {
  contentHash,
  type LocalDocument,
  type SyncContent,
  type SyncNoteContent,
  type SyncStore,
} from '../../main/sync/engine';
import {
  noteMetadataSchema,
  defaultNoteMetadata,
} from '../../shared/note-metadata';
import { withSqliteWrite } from './database';
import type { SqliteLibraryRepository } from './sqlite-library-repository';
import type { SqliteNoteRepository } from './sqlite-note-repository';

// Images are encoded twice, and must still fit CouchDB's default 8 MB documents.
export const maxSyncFileBytes = 4 * 1024 * 1024;
const imageName = /^[a-f0-9]{64}\.(?:png|jpg|gif|webp|svg)$/;
const tagId = (name: string) =>
  `tag:${createHash('sha256').update(name).digest('hex').slice(0, 32)}`;

const noteContent = (note: Note): SyncNoteContent => ({
  type: 'note',
  id: note.id,
  title: note.title,
  body: note.body,
  isPinned: note.isPinned,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  deletedAt: note.deletedAt,
  metadata: note.metadata ?? defaultNoteMetadata,
});

export class SqliteSyncStore implements SyncStore {
  private readonly images: string;

  constructor(
    private readonly database: DatabaseSync,
    private readonly notes: SqliteNoteRepository,
    private readonly library: SqliteLibraryRepository,
    userData: string,
    private readonly onNoteApplied: (
      note: Note,
      removed: boolean,
    ) => void = () => {},
  ) {
    this.images = path.join(userData, 'images');
  }

  private books() {
    return this.database
      .prepare(
        `SELECT id, name, parent_id AS parentId, created_at AS createdAt, icon, position
         FROM notebooks ORDER BY id`,
      )
      .all()
      .map((row) => ({
        type: 'book' as const,
        id: String(row.id),
        name: String(row.name),
        parentId: row.parentId === null ? null : String(row.parentId),
        createdAt: String(row.createdAt),
        icon: String(row.icon),
        position: Number(row.position),
      }));
  }

  private tags() {
    return this.database
      .prepare('SELECT name, color FROM tags ORDER BY name')
      .all()
      .map((row) => ({
        type: 'tag' as const,
        name: String(row.name),
        color: row.color === null ? null : String(row.color),
      }));
  }

  private allNotes() {
    return this.database
      .prepare('SELECT id FROM notes ORDER BY id')
      .all()
      .flatMap((row) => {
        const note = this.notes.findById(String(row.id));
        return note ? [note] : [];
      });
  }

  listLocal() {
    const documents: LocalDocument[] = [];
    const add = (docId: string, content: SyncContent) =>
      documents.push({
        docId,
        hash: contentHash(content),
        load: () => content,
      });
    for (const book of this.books()) add(`book:${book.id}`, book);
    for (const tag of this.tags()) add(tagId(tag.name), tag);
    let skippedFiles = 0;
    if (existsSync(this.images))
      for (const name of readdirSync(this.images)) {
        if (!imageName.test(name)) continue;
        const file = path.join(this.images, name);
        if (statSync(file).size > maxSyncFileBytes) {
          skippedFiles += 1;
          continue;
        }
        // Names contain the content hash, so unchanged images are never read.
        documents.push({
          docId: `file:${name}`,
          hash: name,
          load: () => ({
            type: 'file',
            name,
            data: readFileSync(file).toString('base64'),
          }),
        });
      }
    for (const note of this.allNotes())
      add(`note:${note.id}`, noteContent(note));
    return { documents, skippedFiles };
  }

  localContent(docId: string): SyncContent | null {
    const [kind, ...rest] = docId.split(':');
    const id = rest.join(':');
    if (kind === 'note') {
      const note = this.notes.findById(id);
      return note ? noteContent(note) : null;
    }
    if (kind === 'book')
      return this.books().find((book) => book.id === id) ?? null;
    if (kind === 'tag')
      return this.tags().find((tag) => tagId(tag.name) === docId) ?? null;
    return null;
  }

  known() {
    return new Map(
      this.database
        .prepare(
          'SELECT doc_id AS docId, rev, content_hash AS hash FROM sync_documents',
        )
        .all()
        .map((row) => [
          String(row.docId),
          { rev: String(row.rev), hash: String(row.hash) },
        ]),
    );
  }

  remember(docId: string, rev: string, hash: string) {
    this.database
      .prepare(
        `INSERT INTO sync_documents (doc_id, rev, content_hash) VALUES (?, ?, ?)
         ON CONFLICT(doc_id) DO UPDATE SET rev = excluded.rev, content_hash = excluded.content_hash`,
      )
      .run(docId, rev, hash);
  }

  forget(docId: string) {
    this.database
      .prepare('DELETE FROM sync_documents WHERE doc_id = ?')
      .run(docId);
  }

  // A new server starts from nothing, and the local notes stay untouched.
  reset() {
    this.database.exec('DELETE FROM sync_documents');
    this.database
      .prepare("DELETE FROM sync_checkpoints WHERE target_id = 'couchdb'")
      .run();
  }

  getCursor(targetId: string) {
    const row = this.database
      .prepare('SELECT cursor FROM sync_checkpoints WHERE target_id = ?')
      .get(targetId);
    return row?.cursor ? String(row.cursor) : '0';
  }

  setCursor(targetId: string, cursor: string) {
    this.database
      .prepare(
        `INSERT INTO sync_checkpoints (target_id, cursor, last_applied_operation_id, updated_at)
         VALUES (?, ?, NULL, ?)
         ON CONFLICT(target_id) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
      )
      .run(targetId, cursor, new Date().toISOString());
  }

  apply(content: SyncContent) {
    if (content.type === 'note') {
      const { type: _type, ...fields } = content;
      const metadata = noteMetadataSchema.parse(fields.metadata);
      const known = this.books().some(
        (book) => book.id === metadata.notebookId,
      );
      const note = this.notes.applyRemote({
        ...fields,
        metadata: known ? metadata : { ...metadata, notebookId: null },
      });
      this.onNoteApplied(note, false);
    } else if (content.type === 'book') {
      const parent = this.books().some((book) => book.id === content.parentId)
        ? content.parentId
        : null;
      this.database
        .prepare(
          `INSERT INTO notebooks (id, name, parent_id, created_at, icon, position)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id,
             icon = excluded.icon, position = excluded.position`,
        )
        .run(
          content.id,
          content.name,
          parent,
          content.createdAt,
          content.icon,
          content.position,
        );
    } else if (content.type === 'tag') {
      this.database
        .prepare(
          `INSERT INTO tags (name, color) VALUES (?, ?)
           ON CONFLICT(name) DO UPDATE SET color = excluded.color`,
        )
        .run(content.name, content.color);
    } else this.writeImage(content.name, content.data);
  }

  private writeImage(name: string, data: string) {
    const bytes = Buffer.from(data, 'base64');
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!imageName.test(name) || !name.startsWith(`${hash}.`)) return;
    mkdirSync(this.images, { recursive: true });
    const target = path.join(this.images, name);
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: 'wx' });
  }

  remove(docId: string) {
    const content = this.localContent(docId);
    if (content?.type === 'note') {
      const note = this.notes.findById(content.id);
      this.notes.removeRemote(content.id);
      if (note) this.onNoteApplied(note, true);
    } else if (content?.type === 'book')
      this.library.deleteNotebook(content.id);
    else if (content?.type === 'tag') this.library.deleteTag(content.name);
  }

  copyAsConflict({ type: _type, ...note }: SyncNoteContent) {
    const metadata = noteMetadataSchema.parse(note.metadata);
    withSqliteWrite(this.database, () =>
      this.notes.insertSnapshot({
        ...note,
        id: randomUUID(),
        title: `${note.title} (conflicto)`.slice(0, 512),
        revision: 1,
        metadata: {
          ...metadata,
          tags: [...new Set([...metadata.tags, 'conflicto'])],
        },
      }),
    );
  }
}
