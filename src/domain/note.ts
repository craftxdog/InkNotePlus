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
}

export interface CreateNoteInput {
  title: string;
  body: string;
}

export interface UpdateNoteInput extends CreateNoteInput {
  id: NoteId;
  expectedRevision: number;
}

export interface ListNotesInput {
  limit?: number;
}

export interface SearchNotesInput extends ListNotesInput {
  query: string;
}
