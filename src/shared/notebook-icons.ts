import { z } from './validation';

export const notebookIconSchema = z.enum([
  'book-open',
  'notebook',
  'inbox',
  'briefcase',
  'rocket',
  'code',
  'terminal',
  'folder',
  'file-text',
  'book',
  'graduation-cap',
  'lightbulb',
  'flask',
  'bug',
  'heart',
  'star',
  'home',
  'globe',
  'cloud',
  'database',
  'calendar',
  'check',
  'coffee',
  'music',
]);
export type NotebookIconName = z.output<typeof notebookIconSchema>;
export const setNotebookIconSchema = z
  .object({ id: z.uuid(), icon: notebookIconSchema })
  .strict();
export type SetNotebookIconInput = z.output<typeof setNotebookIconSchema>;
