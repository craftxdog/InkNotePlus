import { z } from './validation';

const noteUrl = /^inknote:\/\/note\/([0-9a-f-]{36})$/i;
const uuid = z.uuid();

export function linkedNoteId(url: string) {
  const match = noteUrl.exec(url);
  if (!match || match[0] !== url) return null;
  const id = uuid.safeParse(match[1].toLowerCase());
  return id.success ? id.data : null;
}

export function noteMarkdownLink(note: { id: string; title: string }) {
  const label =
    note.title.replace(/[\r\n]+/g, ' ').replace(/[\\[\]]/g, '\\$&') ||
    'Nota sin título';
  return `[${label}](inknote://note/${note.id})`;
}
