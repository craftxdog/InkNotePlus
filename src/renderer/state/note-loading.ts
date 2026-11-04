import type { InkNoteApi } from '../../preload/api';
import {
  success,
  type ListNotesInput,
  type NoteProjection,
  type Result,
} from '../../shared/ipc';

// Each IPC response stays bounded. Re-read the loaded window after a change,
// because pins, titles and deletions can move notes across an OFFSET boundary.
export async function loadNoteWindow(
  api: InkNoteApi,
  query: string,
  filter: ListNotesInput,
  offset: number,
  count: number,
  current: () => boolean,
): Promise<Result<{ notes: NoteProjection[]; hasMore: boolean }> | null> {
  const notes: NoteProjection[] = [];
  let hasMore = false;
  while (notes.length < count && current()) {
    const limit = Math.min(50, count - notes.length);
    const page = { ...filter, offset: offset + notes.length, limit };
    const result = query
      ? await api.notes.search({ ...page, query })
      : await api.notes.list(page);
    if (!current()) return null;
    if (!result.ok) return result;
    notes.push(...result.data);
    hasMore = result.data.length === limit;
    if (!hasMore) break;
  }
  return current() ? success({ notes, hasMore }) : null;
}
