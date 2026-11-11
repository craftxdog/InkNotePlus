import { z } from '../../shared/validation';
import { noteStatusSchema } from '../../shared/note-metadata';
import { tagNameSchema } from '../../shared/tags';
import type { WorkspaceState } from './workspace-types';

const sessionSchema = z.object({
  activeNoteId: z.uuid().nullable(),
  navigation: z.discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({ type: z.literal('templates') }),
    z.object({ type: z.literal('trash') }),
    z.object({ type: z.literal('notebook'), id: z.uuid() }),
    z.object({ type: z.literal('status'), status: noteStatusSchema }),
    z.object({ type: z.literal('tag'), name: tagNameSchema }),
  ]),
  searchQuery: z.string().max(512),
  searchGlobal: z.boolean(),
  mainLayout: z.object({
    sidebarVisible: z.boolean(),
    distractionFreeEnabled: z.boolean(),
  }),
  noteHistory: z
    .object({
      ids: z.array(z.uuid()).max(100),
      index: z.number().int().min(-1).max(99),
    })
    .refine((history) =>
      history.ids.length === 0
        ? history.index === -1
        : history.index >= 0 && history.index < history.ids.length,
    )
    .optional(),
});

export type WorkspaceSession = z.output<typeof sessionSchema>;
const key = 'inknote.workspace-session';

export function readWorkspaceSession(
  storage: Storage,
): WorkspaceSession | undefined {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 12000) return;
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeWorkspaceSession(storage: Storage, state: WorkspaceState) {
  if (state.noteList.status !== 'ready') return;
  const {
    activeNoteId,
    navigation,
    searchQuery,
    searchGlobal,
    mainLayout,
    noteHistory,
  } = state;
  try {
    storage.setItem(
      key,
      JSON.stringify({
        activeNoteId,
        navigation,
        searchQuery,
        searchGlobal,
        mainLayout,
        noteHistory,
      }),
    );
  } catch {
    // A full or unavailable session store must not interrupt note editing.
  }
}
