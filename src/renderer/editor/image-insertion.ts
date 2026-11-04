import { StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { ManagedImage } from '../../shared/images';
import type { Result } from '../../shared/ipc';

type Target = { from: number; to: number };
const bookmark = StateEffect.define<{ id: symbol; target?: Target }>();
const pendingImages = StateField.define<ReadonlyMap<symbol, Target>>({
  create: () => new Map(),
  update(value, transaction) {
    if (
      !value.size &&
      !transaction.effects.some((effect) => effect.is(bookmark))
    )
      return value;
    const next = new Map<symbol, Target>();
    for (const [id, range] of value) {
      let overlaps = false;
      transaction.changes.iterChangedRanges((from, to) => {
        if (range.from !== range.to && from < range.to && to > range.from)
          overlaps = true;
      });
      if (!overlaps)
        next.set(id, {
          from: transaction.changes.mapPos(
            range.from,
            range.from === range.to ? -1 : 1,
          ),
          to: transaction.changes.mapPos(range.to, -1),
        });
    }
    for (const effect of transaction.effects)
      if (effect.is(bookmark)) {
        if (effect.value.target) next.set(effect.value.id, effect.value.target);
        else next.delete(effect.value.id);
      }
    return next;
  },
});
export function prepareImageInsertion(view: EditorView) {
  if (!view.state.field(pendingImages, false))
    view.dispatch({ effects: StateEffect.appendConfig.of(pendingImages) });
  const id = Symbol('image-import');
  const originalSelection = view.state.selection;
  const target = view.state.selection.main;
  view.dispatch({
    effects: bookmark.of({ id, target: { from: target.from, to: target.to } }),
  });
  return {
    insert(markdown: string) {
      const current = view.state.field(pendingImages).get(id);
      if (!current) return false;
      view.dispatch({
        changes: { from: current.from, to: current.to, insert: markdown },
        effects: bookmark.of({ id }),
        ...(originalSelection.eq(view.state.selection)
          ? { selection: { anchor: current.from + markdown.length } }
          : {}),
        userEvent: 'input.paste',
      });
      return true;
    },
    dispose() {
      view.dispatch({ effects: bookmark.of({ id }) });
    },
  };
}

export type ImageImportError = 'invalid' | 'changed' | null;
export async function insertManagedImages(
  editor: EditorView,
  importImage: (base64?: string) => Promise<Result<ManagedImage | null>>,
  isCurrent: () => boolean,
  files?: File[],
): Promise<ImageImportError> {
  const insertion = prepareImageInsertion(editor);
  const markdown: string[] = [];
  let error: ImageImportError = null;
  try {
    for (const file of files?.slice(0, 8) ?? [undefined]) {
      let base64: string | undefined;
      if (file) {
        if (file.size > 5_000_000) {
          error = 'invalid';
          continue;
        }
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      const result = await importImage(base64);
      if (!isCurrent()) return null;
      if (!result.ok) {
        error = 'invalid';
        continue;
      }
      if (!result.data) continue;
      const caption =
        file?.name.replace(/[[\]\\\r\n]/g, '').slice(0, 100) ?? 'Imagen';
      markdown.push(`![${caption}](${result.data.url})`);
    }
    if (markdown.length && !insertion.insert(markdown.join('\n\n')))
      error = 'changed';
    return error;
  } catch {
    return 'invalid';
  } finally {
    if (isCurrent()) insertion.dispose();
  }
}
