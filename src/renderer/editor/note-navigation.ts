import { EditorView } from '@codemirror/view';

const previewBlocks = '[data-source-line]';

export function jumpToNoteLine(line: number) {
  const layout = document.querySelector<HTMLElement>('.editor-layout');
  const element =
    layout?.dataset.editorMode === 'preview'
      ? null
      : layout?.querySelector<HTMLElement>('.pane--editor .cm-editor');
  const view = element && EditorView.findFromDOM(element);
  if (view) {
    const { from } = view.state.doc.line(
      Math.min(Math.max(line, 1), view.state.doc.lines),
    );
    view.dispatch({
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
    return true;
  }
  const target = [
    ...(layout?.querySelectorAll<HTMLElement>(
      `.pane--preview ${previewBlocks}`,
    ) ?? []),
  ].find((block) => Number(block.dataset.sourceLine) >= line);
  target?.scrollIntoView({ block: 'start' });
  return !!target;
}

export function previewLineAtTop(pane: HTMLElement) {
  const top = pane.getBoundingClientRect().top;
  const block = [...pane.querySelectorAll<HTMLElement>(previewBlocks)].find(
    (candidate) => candidate.getBoundingClientRect().bottom > top + 1,
  );
  return block ? Number(block.dataset.sourceLine) : 1;
}
