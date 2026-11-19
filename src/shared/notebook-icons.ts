import { z } from './validation';

// Any Lucide name is valid. The renderer falls back when an icon is unknown.
export const notebookIconSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type NotebookIconName = z.output<typeof notebookIconSchema>;
export const setNotebookIconSchema = z
  .object({ id: z.uuid(), icon: notebookIconSchema })
  .strict();
export type SetNotebookIconInput = z.output<typeof setNotebookIconSchema>;
