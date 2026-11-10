import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  emptyLibrary,
  librarySchema,
  notebookSchema,
  type CreateNotebookInput,
  type LibraryInput,
  type LibrarySnapshot,
  type Notebook,
} from '../../shared/library';
import { noteFilter, subtreeSql } from './note-query';
import { compileNoteSearch } from './search-query';
import type { SetNotebookIconInput } from '../../shared/notebook-icons';
import { defaultNoteMetadata } from '../../shared/note-metadata';
import type { UpdateTagInput } from '../../shared/tags';
import { withSqliteWrite } from './database';
import { SqliteNoteRepository } from './sqlite-note-repository';

export class TagNameConflictError extends Error {}

export class SqliteLibraryRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly notes = new SqliteNoteRepository(database),
  ) {}
  createNotebook(input: CreateNotebookInput): Notebook {
    const id = randomUUID();
    this.database
      .prepare(
        'INSERT INTO notebooks(id,name,parent_id,created_at,icon) VALUES (?,?,?,?,?)',
      )
      .run(
        id,
        input.name,
        input.parentId ?? null,
        new Date().toISOString(),
        input.icon ?? 'book-open',
      );
    return {
      id,
      name: input.name,
      parentId: input.parentId ?? null,
      count: 0,
      descendantCount: 0,
      icon: input.icon ?? 'book-open',
    };
  }

  getSnapshot(input: LibraryInput = {}): LibrarySnapshot {
    const scope = input.scopeId ? { scopeId: input.scopeId } : {};
    const active = noteFilter(scope);
    // Keep the complete notebook catalogue for ancestry and the editor selector.
    // Badges distinguish direct notes from the collapsed subtree, like Inkdrop.
    const notebooks = this.database
      .prepare(`
      WITH RECURSIVE descendants(ancestor,id) AS (
        SELECT id,id FROM notebooks
        UNION SELECT d.ancestor,b.id FROM descendants d JOIN notebooks b ON b.parent_id=d.id
      )
      SELECT b.id,b.name,b.parent_id AS parentId,b.icon,
        (SELECT COUNT(*) FROM notes n WHERE n.deleted_at IS NULL AND json_extract(n.metadata_json,'$.notebookId')=b.id) AS count,
        (SELECT COUNT(*) FROM notes n WHERE n.deleted_at IS NULL AND json_extract(n.metadata_json,'$.notebookId') IN (SELECT id FROM descendants WHERE ancestor=b.id)) AS descendantCount
      FROM notebooks b ORDER BY b.name COLLATE NOCASE
    `)
      .all()
      .map((row) => notebookSchema.parse(row));
    const tagRows = this.database
      .prepare(`
      WITH counts AS (
        SELECT j.value AS name, COUNT(DISTINCT notes.id) AS count
        FROM notes, json_each(notes.metadata_json,'$.tags') j
        WHERE ${active.sql} GROUP BY j.value
      )
      SELECT tags.name, tags.color, coalesce(counts.count, 0) AS count
      FROM tags LEFT JOIN counts ON counts.name = tags.name
      ORDER BY tags.name COLLATE NOCASE
    `)
      .all(...active.params);
    const tags = tagRows
      .filter(({ count }) => !input.scopeId || Number(count) > 0)
      .map(({ color, ...tag }) => (color === null ? tag : { ...tag, color }));
    const tagColors = tagRows
      .filter(({ color }) => color !== null)
      .map(({ name, color }) => ({ name, color }));
    const statuses = { ...emptyLibrary.statuses };
    for (const row of this.database
      .prepare(`
      SELECT json_extract(notes.metadata_json,'$.status') AS status,COUNT(*) AS count
      FROM notes WHERE ${active.sql} GROUP BY status
    `)
      .all(...active.params)) {
      if (typeof row.status === 'string' && row.status in statuses)
        statuses[row.status as keyof typeof statuses] = Number(row.count);
    }
    const matchingFilter =
      input.globalSearch || input.filter?.trashed
        ? { ...input.filter }
        : { ...input.filter, ...scope };
    return librarySchema.parse({
      notebooks,
      tags,
      tagColors,
      statuses,
      total: this.count(scope),
      trash: this.count({ trashed: true }),
      templates: this.count({ ...scope, templates: true }),
      unfiled: this.count({ ...scope, notebookId: null }),
      matching: this.count(matchingFilter, input.query),
    });
  }

  private count(
    input: Parameters<typeof noteFilter>[0],
    query?: string,
  ): number {
    const filter = query
      ? compileNoteSearch(input, query)
      : { ...noteFilter(input), join: '' };
    const row = this.database
      .prepare(`
      SELECT COUNT(*) AS count FROM notes
      ${filter.join}
      WHERE ${filter.sql}
    `)
      .get(...filter.params);
    return Number(row?.count ?? 0);
  }

  setNotebookIcon(input: SetNotebookIconInput): Notebook {
    const changed = this.database
      .prepare('UPDATE notebooks SET icon=? WHERE id=?')
      .run(input.icon, input.id);
    if (changed.changes !== 1) throw new Error('Notebook does not exist.');
    return this.getSnapshot().notebooks.find((book) => book.id === input.id)!;
  }

  deleteNotebook(id: string): string[] {
    return withSqliteWrite(this.database, () => {
      const deleted = this.database
        .prepare(subtreeSql)
        .all(id)
        .map((row) => String(row.id));
      if (!deleted.length) return [];
      const affected = this.database
        .prepare(`
        SELECT id FROM notes
        WHERE json_extract(metadata_json, '$.notebookId') IN (${subtreeSql})
      `)
        .all(id);
      const now = new Date().toISOString();
      for (const row of affected) {
        const note = this.notes.findById(String(row.id))!;
        const metadata = note.metadata ?? defaultNoteMetadata;
        this.notes.writePlacement(
          note,
          { ...metadata, notebookId: null },
          note.deletedAt ?? now,
        );
      }
      this.database
        .prepare(`DELETE FROM notebooks WHERE id IN (${subtreeSql})`)
        .run(id);
      return deleted;
    });
  }

  updateTag({ name, nextName, color }: UpdateTagInput): boolean {
    return withSqliteWrite(this.database, () => {
      if (!this.hasTag(name)) return false;
      if (nextName !== name && this.hasTag(nextName))
        throw new TagNameConflictError();
      this.database
        .prepare('UPDATE tags SET name = ?, color = ? WHERE name = ?')
        .run(nextName, color, name);
      if (name !== nextName) this.replaceTag(name, nextName);
      return true;
    });
  }

  deleteTag(name: string): boolean {
    return withSqliteWrite(this.database, () => {
      if (!this.hasTag(name)) return false;
      this.replaceTag(name, null);
      this.database.prepare('DELETE FROM tags WHERE name = ?').run(name);
      return true;
    });
  }

  private hasTag(name: string): boolean {
    return !!this.database
      .prepare('SELECT 1 FROM tags WHERE name = ?')
      .get(name);
  }

  private replaceTag(name: string, replacement: string | null): void {
    const rows = this.database
      .prepare(`
      SELECT notes.id FROM notes WHERE EXISTS (
        SELECT 1 FROM json_each(notes.metadata_json, '$.tags') WHERE value = ?
      )
    `)
      .all(name);
    for (const row of rows) {
      const note = this.notes.findById(String(row.id))!;
      const metadata = note.metadata ?? defaultNoteMetadata;
      const tags =
        replacement === null
          ? metadata.tags.filter((tag) => tag !== name)
          : metadata.tags.map((tag) => (tag === name ? replacement : tag));
      this.notes.writePlacement(note, { ...metadata, tags }, note.deletedAt);
    }
  }
}
