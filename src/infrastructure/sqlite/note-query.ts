import type { ListNotesInput } from '../../domain/note';

// UNION deduplicates even malformed cyclic hierarchies; all IDs stay bound.
export const subtreeSql = `WITH RECURSIVE subtree(id) AS (
  SELECT id FROM notebooks WHERE id = ?
  UNION SELECT b.id FROM notebooks b JOIN subtree p ON b.parent_id = p.id
) SELECT id FROM subtree`;

export function noteFilter(input: ListNotesInput): {
  sql: string;
  params: (string | number)[];
} {
  const clauses = ['(notes.deleted_at IS NOT NULL) = ?'];
  const params: (string | number)[] = [Number(input.trashed ?? false)];
  if (input.id) {
    clauses.push('notes.id = ?');
    params.push(input.id);
  }
  if (input.titleContains) {
    clauses.push('instr(lower(notes.title), lower(?)) > 0');
    params.push(input.titleContains);
  }
  if (input.scopeId) {
    clauses.push(
      `json_extract(notes.metadata_json,'$.notebookId') IN (${subtreeSql})`,
    );
    params.push(input.scopeId);
  }
  if (input.notebookId === null)
    clauses.push("json_extract(notes.metadata_json,'$.notebookId') IS NULL");
  if (input.notebookId) {
    clauses.push(
      input.includeDescendants
        ? `json_extract(notes.metadata_json,'$.notebookId') IN (${subtreeSql})`
        : "json_extract(notes.metadata_json,'$.notebookId') = ?",
    );
    params.push(input.notebookId);
  }
  if (input.status) {
    clauses.push("json_extract(notes.metadata_json,'$.status') = ?");
    params.push(input.status);
  }
  if (input.excludeFinished && !input.status)
    clauses.push(
      "json_extract(notes.metadata_json,'$.status') NOT IN ('completed','dropped')",
    );
  if (input.templates)
    clauses.push("json_extract(notes.metadata_json,'$.isTemplate') = 1");
  if (input.tag) {
    clauses.push(
      "EXISTS(SELECT 1 FROM json_each(notes.metadata_json,'$.tags') WHERE value = ?)",
    );
    params.push(input.tag);
  }
  return { sql: clauses.join(' AND '), params };
}
