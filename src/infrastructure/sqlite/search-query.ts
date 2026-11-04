import { parseNoteSearch, type SearchTerm } from '../../shared/note-search';
import { noteFilter } from './note-query';
import type { ListNotesInput } from '../../domain/note';

function ftsTerm(term: SearchTerm) {
  const words = term.value.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  if (!words.length) return '';
  return `${term.field === 'title' || term.field === 'body' ? term.field + ':' : ''}"${words.join(' ')}"`;
}

export function compileNoteSearch(input: ListNotesInput, query: string) {
  const parsed = parseNoteSearch(query);
  const filter = noteFilter({
    ...input,
    excludeFinished:
      input.excludeFinished &&
      !parsed.terms.some((term) => term.field === 'status' && !term.exclude),
  });
  const clauses = [filter.sql];
  const params = [...filter.params];
  const positive: string[] = [];
  if (!parsed.valid) clauses.push('0');
  for (const term of parsed.terms) {
    const not = term.exclude ? 'NOT ' : '';
    if (term.field === 'tag') {
      clauses.push(
        `${not}EXISTS (SELECT 1 FROM json_each(notes.metadata_json,'$.tags') WHERE value = ? COLLATE NOCASE)`,
      );
      params.push(term.value);
    } else if (term.field === 'book') {
      clauses.push(
        `json_extract(notes.metadata_json,'$.notebookId') ${not}IN (WITH RECURSIVE books(id) AS (SELECT id FROM notebooks WHERE id = ? OR name = ? COLLATE NOCASE UNION SELECT n.id FROM notebooks n JOIN books p ON n.parent_id = p.id) SELECT id FROM books)${term.exclude ? " OR json_extract(notes.metadata_json,'$.notebookId') IS NULL" : ''}`,
      );
      // Parenthesize the entire predicate so unfiled notes cannot escape other filters.
      clauses[clauses.length - 1] = `(${clauses[clauses.length - 1]})`;
      params.push(term.value, term.value);
    } else if (term.field === 'status') {
      clauses.push(
        `json_extract(notes.metadata_json,'$.status') ${term.exclude ? '!=' : '='} ? COLLATE NOCASE`,
      );
      params.push(term.value.toLowerCase());
    } else {
      const expression = ftsTerm(term);
      if (!expression) {
        if (!term.exclude) clauses.push('0');
        continue;
      }
      if (term.exclude) {
        clauses.push(
          'notes.rowid NOT IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)',
        );
        params.push(expression);
      } else positive.push(expression);
    }
  }
  const fts = positive.join(' AND ');
  if (fts) {
    clauses.push('notes_fts MATCH ?');
    params.push(fts);
  }
  return {
    sql: clauses.join(' AND '),
    params,
    fts,
    join: fts ? 'JOIN notes_fts ON notes.rowid=notes_fts.rowid' : '',
  };
}
