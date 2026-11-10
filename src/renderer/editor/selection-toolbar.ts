import { showTooltip, type Tooltip } from '@codemirror/view';
import { tableAtCursor, tableEditing } from './table-editor';

export function selectionToolbar(mount: (element: HTMLElement | null) => void) {
  // CodeMirror identifies an existing tooltip by its create callback. Keep the
  // same host while the selection moves so the toolbar's portal stays mounted.
  const create: Tooltip['create'] = (view) => {
    const dom = document.createElement('div');
    dom.className = 'inknote-floating-format';
    dom.hidden = !view.hasFocus;
    mount(dom);
    return {
      dom,
      update(update) {
        if (update.focusChanged) dom.hidden = !update.view.hasFocus;
      },
      destroy() {
        mount(null);
      },
    };
  };
  return showTooltip.compute(['selection', 'doc', tableEditing], (state) => {
    const { from, to, empty } = state.selection.main;
    if (
      empty ||
      state.readOnly ||
      state.selection.ranges.length !== 1 ||
      tableAtCursor(state)
    )
      return null;
    return {
      pos: from,
      end: to,
      above: true,
      create,
    };
  });
}
