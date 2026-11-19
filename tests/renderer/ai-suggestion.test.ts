// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import {
  aiSuggestion,
  currentAiSuggestion,
  requestAiSuggestion,
} from '../../src/renderer/editor/ai-suggestion';

let view: EditorView;
afterEach(() => {
  view.destroy();
  vi.useRealTimers();
});

function setup(
  answer: { text: string } | { error: string } = { text: ' mundo' },
  auto = false,
) {
  const cancel = vi.fn();
  const suggest = vi.fn(() => ({ result: Promise.resolve(answer), cancel }));
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: 'Hola',
      selection: { anchor: 4 },
      extensions: aiSuggestion({ suggest, isAuto: () => auto }),
    }),
  });
  return { suggest, cancel };
}
const key = (name: string) =>
  runScopeHandlers(view, new KeyboardEvent('keydown', { key: name }), 'editor');
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AI ghost text', () => {
  it('shows the suggestion without changing the note', async () => {
    const { suggest } = setup();
    expect(requestAiSuggestion(view)).toBe(true);
    await settle();
    expect(suggest).toHaveBeenCalledWith({ before: 'Hola', after: '' });
    expect(view.dom.querySelector('.cm-ai-suggestion')?.textContent).toBe(
      ' mundo',
    );
    expect(view.state.doc.toString()).toBe('Hola');
  });

  it('accepts with Tab and leaves the caret after the text', async () => {
    setup();
    requestAiSuggestion(view);
    await settle();
    expect(key('Tab')).toBe(true);
    expect(view.state.doc.toString()).toBe('Hola mundo');
    expect(view.state.selection.main.head).toBe(10);
    expect(currentAiSuggestion(view.state)).toBeNull();
  });

  it('dismisses with Escape', async () => {
    setup();
    requestAiSuggestion(view);
    await settle();
    expect(key('Escape')).toBe(true);
    expect(view.state.doc.toString()).toBe('Hola');
    expect(currentAiSuggestion(view.state)).toBeNull();
  });

  it('leaves Tab alone when nothing is suggested', () => {
    setup();
    expect(key('Tab')).toBe(false);
  });

  it('disappears when the user keeps typing', async () => {
    setup();
    requestAiSuggestion(view);
    await settle();
    view.dispatch({ changes: { from: 4, insert: '!' } });
    expect(currentAiSuggestion(view.state)).toBeNull();
  });

  it('discards an answer that arrives after an edit', async () => {
    const { cancel } = setup();
    requestAiSuggestion(view);
    view.dispatch({
      changes: { from: 4, insert: '!' },
      selection: { anchor: 5 },
    });
    await settle();
    expect(cancel).toHaveBeenCalled();
    expect(currentAiSuggestion(view.state)).toBeNull();
  });

  it('shows a failed manual request but never accepts it', async () => {
    setup({ error: 'Falta la clave' });
    requestAiSuggestion(view);
    await settle();
    expect(
      view.dom.querySelector('.cm-ai-suggestion--error')?.textContent,
    ).toBe('Falta la clave');
    expect(key('Tab')).toBe(false);
    expect(view.state.doc.toString()).toBe('Hola');
  });

  it('does not ask on its own in manual mode', async () => {
    vi.useFakeTimers();
    const { suggest } = setup();
    view.dispatch({
      changes: { from: 4, insert: '!' },
      userEvent: 'input.type',
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('asks after a pause in automatic mode', async () => {
    vi.useFakeTimers();
    const { suggest } = setup({ text: 'x' }, true);
    view.dispatch({
      changes: { from: 4, insert: '!' },
      selection: { anchor: 5 },
      userEvent: 'input.type',
    });
    await vi.advanceTimersByTimeAsync(1100);
    expect(suggest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(suggest).toHaveBeenCalledOnce();
  });

  it('stays quiet about failures in automatic mode', async () => {
    vi.useFakeTimers();
    setup({ error: 'Error' }, true);
    view.dispatch({
      changes: { from: 4, insert: '!' },
      selection: { anchor: 5 },
      userEvent: 'input.type',
    });
    await vi.advanceTimersByTimeAsync(1300);
    expect(view.dom.querySelector('.cm-ai-suggestion--error')).toBeNull();
  });
});
