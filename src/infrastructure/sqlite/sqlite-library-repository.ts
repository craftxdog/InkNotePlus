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
import { noteFilter, toFtsQuery } from './note-query';
import type { SetNotebookIconInput } from '../../shared/notebook-icons';

export class SqliteLibraryRepository {
  constructor(private readonly database: DatabaseSync) {}
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
    const tags = this.database
      .prepare(`
      SELECT j.value AS name,COUNT(DISTINCT notes.id) AS count
      FROM notes,json_each(notes.metadata_json,'$.tags') j
      WHERE ${active.sql} GROUP BY j.value ORDER BY j.value COLLATE NOCASE
    `)
      .all(...active.params);
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
    const matchingFilter = { ...input.filter, ...scope };
    return librarySchema.parse({
      notebooks,
      tags,
      statuses,
      total: this.count(scope),
      trash: this.count({ ...scope, trashed: true }),
      templates: this.count({ ...scope, templates: true }),
      unfiled: this.count({ ...scope, notebookId: null }),
      matching: this.count(matchingFilter, input.query),
    });
  }

  private count(
    input: Parameters<typeof noteFilter>[0],
    query?: string,
  ): number {
    const filter = noteFilter(input);
    const fts = query ? toFtsQuery(query) : '';
    if (query && !fts) return 0;
    const row = this.database
      .prepare(`
      SELECT COUNT(*) AS count FROM notes
      ${fts ? 'JOIN notes_fts ON notes.rowid=notes_fts.rowid' : ''}
      WHERE ${filter.sql} ${fts ? 'AND notes_fts MATCH ?' : ''}
    `)
      .get(...filter.params, ...(fts ? [fts] : []));
    return Number(row?.count ?? 0);
  }

  setNotebookIcon(input: SetNotebookIconInput): Notebook {
    const changed = this.database
      .prepare('UPDATE notebooks SET icon=? WHERE id=?')
      .run(input.icon, input.id);
    if (changed.changes !== 1) throw new Error('Notebook does not exist.');
    return this.getSnapshot().notebooks.find((book) => book.id === input.id)!;
  }
}
