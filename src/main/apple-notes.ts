import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from '../shared/validation';

const execute = promisify(execFile);

// Read-only JXA. Locked notes stay locked and the trash is not imported.
export const appleNotesScript = String.raw`
var Notes = Application('Notes');
var deleted = ['Recently Deleted', 'Eliminado recientemente', 'Eliminadas recientemente'];
var notes = [];
var locked = 0;
Notes.accounts().forEach(function (account) {
  account.folders().forEach(function (folder) {
    if (deleted.indexOf(folder.name()) >= 0) return;
    folder.notes().forEach(function (note) {
      if (note.passwordProtected()) { locked += 1; return; }
      notes.push({
        folders: [account.name(), folder.name()],
        title: note.name(),
        html: note.body(),
        createdAt: note.creationDate().toISOString(),
        updatedAt: note.modificationDate().toISOString(),
      });
    });
  });
});
JSON.stringify({ notes: notes, locked: locked });
`;

export const appleNoteSchema = z.object({
  folders: z.array(z.string()).max(8),
  title: z.string(),
  html: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppleNote = z.output<typeof appleNoteSchema>;
const answerSchema = z.object({
  notes: z.array(appleNoteSchema),
  locked: z.number().int().min(0),
});

export class AppleNotesPermissionError extends Error {
  readonly code = 'permission';
}

const runOsascript = async (command: string, args: string[]) =>
  (
    await execute(command, args, {
      maxBuffer: 1024 * 1024 * 1024,
      timeout: 15 * 60_000,
    })
  ).stdout;

export async function readAppleNotes(
  run: (command: string, args: string[]) => Promise<string> = runOsascript,
) {
  let output: string;
  try {
    output = await run('osascript', [
      '-l',
      'JavaScript',
      '-e',
      appleNotesScript,
    ]);
  } catch (error) {
    if (/-1743|not authorized/i.test(String(error)))
      throw new AppleNotesPermissionError();
    throw error;
  }
  return answerSchema.parse(JSON.parse(output));
}
