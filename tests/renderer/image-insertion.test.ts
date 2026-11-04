// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertManagedImages } from '../../src/renderer/editor/image-insertion';
import { deferred } from '../support/renderer-api';
import type { Result } from '../../src/shared/ipc';
import type { ManagedImage } from '../../src/shared/images';

let view: EditorView;
afterEach(() => view?.destroy());
const image = {
  url: `inknote-asset://images/${'a'.repeat(64)}.png`,
  width: 10,
  height: 10,
};
describe('asynchronous image insertion', () => {
  it.each([0, 3])(
    'keeps new text inserted at replacement boundary %i',
    async (position) => {
      view = new EditorView({
        state: EditorState.create({
          doc: 'old text',
          selection: { anchor: 0, head: 3 },
        }),
      });
      const pending = deferred<Result<ManagedImage | null>>();
      const operation = insertManagedImages(
        view,
        () => pending.promise,
        () => true,
      );
      view.dispatch({
        changes: { from: position, insert: 'NEW' },
        selection: { anchor: position + 3 },
      });
      pending.resolve({ ok: true, data: image });
      expect(await operation).toBeNull();
      const inserted = `![Imagen](${image.url})`;
      expect(view.state.doc.toString()).toBe(
        position === 0 ? `NEW${inserted} text` : `${inserted}NEW text`,
      );
    },
  );
  it('preserves text selected after the import started', async () => {
    view = new EditorView({
      state: EditorState.create({
        doc: 'keep this text',
        selection: { anchor: 0 },
      }),
    });
    const pending = deferred<Result<ManagedImage | null>>();
    const operation = insertManagedImages(
      view,
      () => pending.promise,
      () => true,
    );
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    pending.resolve({ ok: true, data: image });
    expect(await operation).toBeNull();
    expect(view.state.doc.toString()).toBe(
      `![Imagen](${image.url})keep this text`,
    );
  });
  it('maps the original insertion point through intervening edits', async () => {
    view = new EditorView({
      state: EditorState.create({ doc: 'abcDEF', selection: { anchor: 3 } }),
    });
    const pending = deferred<Result<ManagedImage | null>>();
    const operation = insertManagedImages(
      view,
      () => pending.promise,
      () => true,
    );
    view.dispatch({ changes: { from: 0, insert: 'Q' } });
    pending.resolve({ ok: true, data: image });
    expect(await operation).toBeNull();
    expect(view.state.doc.toString()).toBe(`Qabc![Imagen](${image.url})DEF`);
  });
  it('cancels replacement if the originally selected text was edited', async () => {
    view = new EditorView({
      state: EditorState.create({
        doc: 'old text',
        selection: { anchor: 0, head: 3 },
      }),
    });
    const pending = deferred<Result<ManagedImage | null>>();
    const operation = insertManagedImages(
      view,
      () => pending.promise,
      () => true,
    );
    view.dispatch({ changes: { from: 0, to: 3, insert: 'new' } });
    pending.resolve({ ok: true, data: image });
    expect(await operation).toBe('changed');
    expect(view.state.doc.toString()).toBe('new text');
  });
});
