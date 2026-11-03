import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  emptyLibrary,
  librarySchema,
  notebookSchema,
  type CreateNotebookInput,
  type LibrarySnapshot,
  type Notebook,
} from '../../shared/library';

export class SqliteLibraryRepository {
  constructor(private readonly database: DatabaseSync) {}
  createNotebook(input: CreateNotebookInput): Notebook {
    const id = randomUUID();
    this.database
      .prepare(
        'INSERT INTO notebooks(id,name,parent_id,created_at) VALUES (?,?,?,?)',
      )
      .run(id, input.name, input.parentId ?? null, new Date().toISOString());
    return { id, name: input.name, parentId: input.parentId ?? null, count: 0 };
  }
  getSnapshot(): LibrarySnapshot {
    const notebooks = this.database
      .prepare(
        `SELECT b.id,b.name,b.parent_id AS parentId,COUNT(n.id) AS count FROM notebooks b LEFT JOIN notes n ON json_extract(n.metadata_json,'$.notebookId')=b.id AND n.deleted_at IS NULL GROUP BY b.id ORDER BY b.name COLLATE NOCASE LIMIT 1000`,
      )
      .all()
      .map((row) => notebookSchema.parse(row));
    const tags = this.database
      .prepare(
        `SELECT j.value AS name,COUNT(DISTINCT n.id) AS count FROM notes n,json_each(n.metadata_json,'$.tags') j WHERE n.deleted_at IS NULL GROUP BY j.value ORDER BY j.value COLLATE NOCASE LIMIT 1000`,
      )
      .all();
    const counts = this.database
      .prepare(
        `SELECT COUNT(*) FILTER(WHERE deleted_at IS NULL) AS total,COUNT(*) FILTER(WHERE deleted_at IS NOT NULL) AS trash,COUNT(*) FILTER(WHERE deleted_at IS NULL AND json_extract(metadata_json,'$.isTemplate')=1) AS templates FROM notes`,
      )
      .get();
    const statuses = { ...emptyLibrary.statuses };
    for (const row of this.database
      .prepare(
        `SELECT json_extract(metadata_json,'$.status') AS status,COUNT(*) AS count FROM notes WHERE deleted_at IS NULL GROUP BY status`,
      )
      .all()) {
      if (typeof row.status === 'string' && row.status in statuses)
        statuses[row.status as keyof typeof statuses] = Number(row.count);
    }
    return librarySchema.parse({ ...counts, notebooks, tags, statuses });
  }
}
