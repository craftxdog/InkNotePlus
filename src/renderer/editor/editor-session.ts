import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { z } from '../../shared/validation';

const coordinate = z.number().finite().min(0).max(1_000_000_000);
const snapshotSchema = z.object({
  anchor: coordinate.int(),
  head: coordinate.int(),
  top: coordinate,
  left: coordinate,
  previewTop: coordinate,
});

export function connectEditorSession(
  view: EditorView,
  preview: HTMLElement,
  noteId: string,
  storage: Storage,
) {
  const key = `inknote.editor-session.${noteId}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = storage.getItem(key);
    const parsed =
      raw && raw.length < 1024
        ? snapshotSchema.safeParse(JSON.parse(raw))
        : null;
    if (parsed?.success) {
      const saved = parsed.data;
      view.dispatch({
        selection: EditorSelection.single(
          Math.min(view.state.doc.length, saved.anchor),
          Math.min(view.state.doc.length, saved.head),
        ),
      });
      view.requestMeasure({
        read: () => saved,
        write(position) {
          view.scrollDOM.scrollTop = position.top;
          view.scrollDOM.scrollLeft = position.left;
          preview.scrollTop = position.previewTop;
        },
      });
    }
  } catch {
    // Expired or unavailable browser state must not block the note.
  }
  const save = () => {
    clearTimeout(timer);
    const { anchor, head } = view.state.selection.main;
    try {
      storage.setItem(
        key,
        JSON.stringify({
          anchor,
          head,
          top: view.scrollDOM.scrollTop,
          left: view.scrollDOM.scrollLeft,
          previewTop: preview.scrollTop,
        }),
      );
    } catch {
      // SQLite remains the authoritative note store if session storage is full.
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 200);
  };
  view.scrollDOM.addEventListener('scroll', schedule, { passive: true });
  preview.addEventListener('scroll', schedule, { passive: true });
  const window = view.dom.ownerDocument.defaultView;
  window?.addEventListener('beforeunload', save);
  return {
    schedule,
    destroy() {
      save();
      view.scrollDOM.removeEventListener('scroll', schedule);
      preview.removeEventListener('scroll', schedule);
      window?.removeEventListener('beforeunload', save);
    },
  };
}
