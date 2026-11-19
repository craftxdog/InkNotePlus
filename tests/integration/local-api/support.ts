import {
  applyMigrations,
  openDatabase,
} from '../../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteNoteRepository } from '../../../src/infrastructure/sqlite/sqlite-note-repository';
import { CommandRegistry } from '../../../src/application/command-registry';
import { registerNoteCommands } from '../../../src/application/note-commands';
import { createNotesBackend } from '../../../src/main/local-api/notes-backend';
import type { NoteChangedEvent } from '../../../src/shared/ipc';

export function createBackend() {
  const database = openDatabase(':memory:');
  applyMigrations(database);
  const notes = new SqliteNoteRepository(database);
  const library = new SqliteLibraryRepository(database, notes);
  const commands = new CommandRegistry();
  registerNoteCommands(commands, notes);
  const events: NoteChangedEvent[] = [];
  const backend = createNotesBackend({
    commands,
    library,
    publish: (event) => events.push(event),
  });
  return { backend, library, events, close: () => database.close() };
}
