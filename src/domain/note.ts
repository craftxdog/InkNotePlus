import type { NoteMetadata } from '../shared/note-metadata';
export type NoteId = string;

export interface Note {
  id: NoteId;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  revision: number;
  metadata?: NoteMetadata;
}

export interface CreateNoteInput {
  title: string;
  body: string;
  metadata?: NoteMetadata;
}

export interface UpdateNoteInput extends CreateNoteInput {
  id: NoteId;
  expectedRevision: number;
  isPinned?: boolean;
}

export interface ListNotesInput {
  id?: NoteId;
  titleContains?: string;
  limit?: number;
  offset?: number;
  scopeId?: string;
  includeDescendants?: boolean;
  sort?: 'updated' | 'title';
  trashed?: boolean;
  notebookId?: string | null;
  status?: NoteMetadata['status'];
  tag?: string;
  templates?: boolean;
  excludeFinished?: boolean;
}

export interface SearchNotesInput extends ListNotesInput {
  query: string;
}
