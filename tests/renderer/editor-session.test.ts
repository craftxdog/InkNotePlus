// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it } from 'vitest';
import { connectEditorSession } from '../../src/renderer/editor/editor-session';

afterEach(() => sessionStorage.clear());

it('keeps each note selection separate and clamps restored cursors after an external edit', () => {
  const preview = document.createElement('aside');
  const create = (body: string) =>
    new EditorView({ state: EditorState.create({ doc: body }) });
  const first = create('a longer document');
  const saved = connectEditorSession(first, preview, 'first', sessionStorage);
  first.dispatch({ selection: { anchor: 8, head: 12 } });
  saved.destroy();
  first.destroy();
  const other = create('other note');
  const otherSession = connectEditorSession(
    other,
    preview,
    'other',
    sessionStorage,
  );
  expect(other.state.selection.main.head).toBe(0);
  otherSession.destroy();
  other.destroy();
  const restored = create('a longer document');
  const restoredSession = connectEditorSession(
    restored,
    preview,
    'first',
    sessionStorage,
  );
  expect(restored.state.selection.main).toMatchObject({ anchor: 8, head: 12 });
  restoredSession.destroy();
  restored.destroy();
  const shortened = create('small');
  const shortSession = connectEditorSession(
    shortened,
    preview,
    'first',
    sessionStorage,
  );
  expect(shortened.state.selection.main.head).toBe(5);
  shortSession.destroy();
  shortened.destroy();
});

it('ignores corrupted coordinates without preventing editing', () => {
  sessionStorage.setItem(
    'inknote.editor-session.test',
    '{"head":-1,"top":"bad"}',
  );
  const view = new EditorView({
    state: EditorState.create({ doc: 'editable' }),
  });
  const session = connectEditorSession(
    view,
    document.createElement('aside'),
    'test',
    sessionStorage,
  );
  view.dispatch({ changes: { from: 0, insert: 'still ' } });
  expect(view.state.doc.toString()).toBe('still editable');
  session.destroy();
  view.destroy();
});
