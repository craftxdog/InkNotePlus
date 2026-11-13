// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MarkdownPreview } from '../../src/renderer/editor/markdown-preview';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { App } from '../../src/renderer/app';
import { success } from '../../src/shared/ipc';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { createApi, firstNote } from '../support/renderer-api';

afterEach(cleanup);
function preview(body: string) {
  const store = createWorkspaceStore(createApi().api);
  return render(
    <WorkspaceProvider store={store}>
      <MarkdownPreview body={body} />
    </WorkspaceProvider>,
  );
}

it('renders all five alert types with Inkdrop classes, titles and icons, including empty alerts', () => {
  const body = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']
    .map((type) => `> [!${type}]\n> **Body ${type}**`)
    .join('\n\n');
  const { container } = preview(body);
  const alerts = [...container.querySelectorAll('.gfm-alert')];
  expect(alerts).toHaveLength(5);
  expect(
    alerts.map((alert) => alert.querySelector('.gfm-alert-title')?.textContent),
  ).toEqual(['Note', 'Tip', 'Important', 'Warning', 'Caution']);
  for (const alert of alerts) {
    expect(alert.querySelector('.gfm-alert-title svg')).toBeTruthy();
    expect(alert.querySelector('strong')).toBeTruthy();
    expect(alert.textContent).not.toContain('[!');
  }
  cleanup();
  const empty = preview('> [!CAUTION]');
  const caution = empty.container.querySelector('.gfm-alert-type-caution');
  expect(caution?.textContent?.trim()).toBe('Caution');
  expect(caution?.querySelectorAll('p')).toHaveLength(1);
});

it('keeps fenced code, escaped markers, unknown types and non-leading markers literal', () => {
  const body =
    '```md\n> [!NOTE]\n```\n\n> \\[!NOTE]\n\n> [!UNKNOWN]\n\n> [!WARNING] inline text\n\nA plain [!CAUTION]\n\n>\n> [!NOTE]\n> Body';
  const { container } = preview(body);
  expect(container.querySelector('.gfm-alert')).toBeNull();
  expect(container.querySelector('pre')?.textContent).toContain('[!NOTE]');
  expect(container.textContent).toContain('[!UNKNOWN]');
});

it('renders the nested alerts in the visual reference with independent colors and source positions', () => {
  const { container } = preview(
    '> [!CAUTION]\n> Parent\n> > [!TIP]\n> > Child **text**',
  );
  expect(
    container.querySelector('.gfm-alert-type-caution .gfm-alert-type-tip'),
  ).toBeTruthy();
  expect(container.querySelectorAll('.gfm-alert-title')).toHaveLength(2);
  const child = container.querySelector(
    '.gfm-alert-type-tip [data-source-text-line="4"]',
  );
  expect(child?.textContent).toBe('Child ');
  expect(child?.getAttribute('data-source-text-column')).toBe('5');
  expect(container.textContent).not.toContain('[!');
});

it('renders alerts in quoted and list containers without turning a later same-level marker into an alert', () => {
  const { container } = preview(
    '> Plain quote\n>\n> > [!NOTE]\n> > Nested\n\n- item\n  > [!IMPORTANT]\n  > List alert\n\n> [!TIP]\n> Body\n> [!CAUTION]\n> Same level',
  );
  expect(
    container.querySelector('blockquote .gfm-alert-type-note'),
  ).toBeTruthy();
  expect(container.querySelector('li .gfm-alert-type-important')).toBeTruthy();
  expect(container.querySelector('.gfm-alert-type-caution')).toBeNull();
  expect(container.querySelector('.gfm-alert-type-tip')?.textContent).toContain(
    '[!CAUTION]',
  );
});

it('keeps the source map of multiline bodies and hard breaks after removing the marker', () => {
  const { container } = preview(
    '> [!NOTE]\r\n> body &amp; **bold**\r\n\r\n> [!TIP]  \r\n> second',
  );
  const text = container.querySelector(
    '.gfm-alert-type-note > p:not(.gfm-alert-title) [data-source-text-line]',
  );
  expect(text?.textContent).toBe('body & ');
  expect(text?.getAttribute('data-source-text-line')).toBe('2');
  expect(text?.getAttribute('data-source-text-column')).toBe('3');
  const tip = container.querySelector(
    '.gfm-alert-type-tip > p:not(.gfm-alert-title)',
  );
  expect(tip?.textContent).toBe('second');
  expect(tip?.querySelector('br')).toBeNull();
});

it('preserves interactive tasks and escapes HTML inside an alert', async () => {
  const body =
    '> [!IMPORTANT]\n>\n> - [ ] Do this\n>\n> <script>alert(1)</script>';
  const bridge = createApi({
    list: async () => success([{ ...firstNote, body }]),
    update: async (input) => success({ ...firstNote, ...input, revision: 2 }),
  });
  const store = createWorkspaceStore(bridge.api);
  const { container } = render(<App store={store} />);
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Tarea: Do this' }),
  );
  await waitFor(() =>
    expect(store.getState().document.body).toContain('> - [x] Do this'),
  );
  expect(container.querySelector('.gfm-alert-type-important')).toBeTruthy();
  expect(container.querySelector('.mde-preview script')).toBeNull();
});

it('keeps the exact task offset with CRLF and undoes the nested edit', async () => {
  const body =
    '> [!CAUTION]\r\n> Parent\r\n> > [!TIP]\r\n> > - [ ] same\r\n> > - [ ] same';
  const bridge = createApi({
    list: async () => success([{ ...firstNote, body }]),
    update: async (input) => success({ ...firstNote, ...input, revision: 2 }),
  });
  const store = createWorkspaceStore(bridge.api);
  render(<App store={store} />);
  const boxes = await screen.findAllByRole('checkbox', { name: 'Tarea: same' });
  expect(boxes).toHaveLength(2);
  const editor = EditorView.findFromDOM(
    screen.getByRole('textbox', { name: 'Contenido Markdown de la nota' }),
  )!;
  const originalEditorBody = editor.state.doc.toString();
  fireEvent.click(boxes[1]);
  await waitFor(() =>
    expect(store.getState().document.body).toBe(
      body.replace(
        '> > - [ ] same\r\n> > - [ ] same',
        '> > - [ ] same\r\n> > - [x] same',
      ),
    ),
  );
  expect(undo(editor)).toBe(true);
  await waitFor(() =>
    expect(store.getState().document.body).toBe(originalEditorBody),
  );
});
