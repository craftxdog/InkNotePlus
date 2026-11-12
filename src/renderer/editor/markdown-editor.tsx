import { useEffect, useMemo, useRef } from 'react';
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  type ChangeDesc,
  type Extension,
} from '@codemirror/state';
import { search } from '@codemirror/search';
import type { Preferences } from '../../shared/preferences';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  isolateHistory,
} from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  syntaxTree,
  syntaxHighlighting,
} from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  javascript,
  javascriptLanguage,
  jsxLanguage,
  typescriptLanguage,
  tsxLanguage,
} from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { tokenHighlighter } from './token-highlighter';
import { minimalTextChange } from './markdown-source-map';
import { lineWrappingExtension } from './line-wrapping';
import { githubAlertDecorations } from './github-alert-decorations';
import { indentMarkdown, outdentMarkdown } from './list-indentation';
import { tableCommands, tableEditing } from './table-editor';
import { markdownCompletion } from './markdown-completion';
import type { VimAction } from './vim-mode';
import { selectionToolbar } from './selection-toolbar';
import type { CompletionSource } from '@codemirror/autocomplete';
import { markdownTabKeys } from '../../shared/editor-keybindings';

const codeLanguages = {
  js: javascriptLanguage,
  javascript: javascriptLanguage,
  jsx: jsxLanguage,
  ts: typescriptLanguage,
  typescript: typescriptLanguage,
  tsx: tsxLanguage,
  json: jsonLanguage,
  md: markdownLanguage,
  markdown: markdownLanguage,
};

const externalChange = Annotation.define<boolean>();

export function MarkdownEditor({
  value,
  nonce,
  onChange,
  onView,
  onUpdate,
  preferences,
  onImageFiles,
  onInsertImage,
  onVimAction,
  onFloatingToolbar,
  noteLinks,
}: {
  value: string;
  nonce: string;
  onChange: (value: string) => void;
  onView: (view: EditorView | null) => void;
  onUpdate?: (selectionChanged: boolean, changes: ChangeDesc) => void;
  preferences: Preferences;
  onImageFiles?: (files: File[]) => void;
  onInsertImage?: () => void;
  onVimAction?: (action: VimAction, argument?: string) => void;
  onFloatingToolbar?: (element: HTMLElement | null) => void;
  noteLinks?: CompletionSource;
}) {
  const container = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({
    onChange,
    onView,
    onUpdate,
    onImageFiles,
    onInsertImage,
    onVimAction,
    onFloatingToolbar,
    noteLinks,
  });
  callbacks.current = {
    onChange,
    onView,
    onUpdate,
    onImageFiles,
    onInsertImage,
    onVimAction,
    onFloatingToolbar,
    noteLinks,
  };
  const initialValue = useRef(value);
  const settings = useRef(new Compartment()).current;
  const keyboard = useRef(new Compartment()).current;
  const floating = useMemo(
    () =>
      selectionToolbar((element) =>
        callbacks.current.onFloatingToolbar?.(element),
      ),
    [],
  );
  const initialSettings = useRef(preferences);
  useEffect(() => {
    if (!container.current) return;
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          EditorView.cspNonce.of(nonce),
          EditorState.allowMultipleSelections.of(true),
          rectangularSelection(),
          crosshairCursor(),
          keyboard.of([]),
          settings.of(editorSettings(initialSettings.current, floating)),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: 'var(--editor-background-color)',
              color: 'var(--editor-foreground-color)',
            },
            '&.cm-focused': { outline: 'none' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily:
                'var(--editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
              fontSize: 'var(--editor-font-size, 14px)',
              lineHeight: 'var(--editor-line-height, 1.6)',
            },
            '.cm-content': {
              padding: '12px 0',
              caretColor: 'var(--editor-caret-color)',
            },
            '.cm-line': { padding: '0 12px' },
            '.cm-gutters': {
              backgroundColor: 'var(--editor-gutter-background-color)',
              color: 'var(--editor-gutter-color)',
              border: 'none',
              borderRight: 'var(--editor-gutter-border-right)',
            },
            '.cm-activeLineGutter': {
              backgroundColor:
                'var(--editor-active-line-gutter-background-color)',
            },
            '.cm-activeLine': {
              backgroundColor: 'var(--editor-active-line-background-color)',
            },
            '.cm-cursor': { borderLeftColor: 'var(--editor-caret-color)' },
            '.cm-selectionBackground': {
              backgroundColor: 'var(--editor-selection-background)',
            },
            '&.cm-focused .cm-selectionBackground': {
              backgroundColor: 'var(--editor-focused-selection-background)',
            },
            '.cm-foldGutter': { width: '12px' },
            '.cm-tooltip': {
              backgroundColor: 'var(--popup-background)',
              color: 'var(--text-color)',
              border: 'var(--popup-border)',
              boxShadow: 'var(--popup-box-shadow)',
              borderRadius: 'var(--popup-border-radius)',
            },
            '.cm-tooltip-autocomplete > ul': {
              fontFamily: 'var(--page-font)',
            },
            '.cm-tooltip-autocomplete > ul > li[aria-selected="true"]': {
              backgroundColor: 'var(--note-list-view-item-selected-background)',
              color: 'var(--text-color)',
            },
          }),
          history(),
          EditorView.domEventHandlers({
            paste(event) {
              const files = [...(event.clipboardData?.files ?? [])].filter(
                (file) => /^image\/(png|jpeg|gif|webp)$/.test(file.type),
              );
              if (!files.length || !callbacks.current.onImageFiles)
                return false;
              event.preventDefault();
              callbacks.current.onImageFiles(files);
              return true;
            },
            drop(event, editor) {
              const files = [...(event.dataTransfer?.files ?? [])].filter(
                (file) => /^image\/(png|jpeg|gif|webp)$/.test(file.type),
              );
              if (!files.length || !callbacks.current.onImageFiles)
                return false;
              event.preventDefault();
              const position = editor.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });
              if (position !== null)
                editor.dispatch({ selection: { anchor: position } });
              callbacks.current.onImageFiles(files);
              return true;
            },
          }),
          search({ top: true }),
          drawSelection(),
          bracketMatching(),
          tableEditing,
          Prec.high(
            keymap.of([
              {
                key: 'Tab',
                run: tableCommands['table-editor:next-cell'],
                shift: tableCommands['table-editor:previous-cell'],
              },
              { key: 'Enter', run: tableCommands['table-editor:next-row'] },
              { key: 'Escape', run: tableCommands['table-editor:escape'] },
            ]),
          ),
          markdown({
            base: markdownLanguage,
            codeLanguages: (info) =>
              Object.hasOwn(codeLanguages, info)
                ? codeLanguages[info as keyof typeof codeLanguages]
                : null,
          }),
          javascript({ typescript: true }).support,
          markdownCompletion({
            insertImage: () => callbacks.current.onInsertImage,
            noteLinks: (context) =>
              callbacks.current.noteLinks?.(context) ?? null,
          }),
          syntaxHighlighting(tokenHighlighter),
          githubAlertDecorations,
          keymap.of([
            { key: 'Mod-]', run: indentMarkdown },
            { key: 'Mod-[', run: outdentMarkdown },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged ||
              update.selectionSet ||
              update.startState.field(tableEditing) !==
                update.state.field(tableEditing) ||
              syntaxTree(update.startState) !== syntaxTree(update.state) ||
              update.geometryChanged ||
              update.viewportChanged
            )
              callbacks.current.onUpdate?.(
                update.docChanged || update.selectionSet,
                update.changes,
              );
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(externalChange),
              )
            )
              callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    callbacks.current.onView(view);
    return () => {
      callbacks.current.onView(null);
      viewRef.current = null;
      view.destroy();
    };
  }, [nonce, settings, keyboard, floating]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (preferences.keyboardMode === 'standard') {
      view.dispatch({ effects: keyboard.reconfigure([]) });
      return;
    }
    let live = true;
    void import('./vim-mode').then(({ vimMode }) => {
      if (live)
        view.dispatch({
          effects: keyboard.reconfigure(
            vimMode((action, argument) =>
              callbacks.current.onVimAction?.(action, argument),
            ),
          ),
        });
    });
    return () => {
      live = false;
    };
  }, [keyboard, nonce, preferences.keyboardMode]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: settings.reconfigure(editorSettings(preferences, floating)),
    });
  }, [
    settings,
    floating,
    preferences.lineNumbers,
    preferences.lineWrapping,
    preferences.readableLineLength,
    preferences.keybindings,
    preferences.activeLine,
    preferences.spellcheck,
    preferences.showToolbar,
    preferences.toolbarPlacement,
  ]);
  useEffect(() => {
    const view = viewRef.current;
    const normalized = view?.state.toText(value).toString();
    if (
      view &&
      normalized !== undefined &&
      view.state.doc.toString() !== normalized
    )
      view.dispatch({
        changes: minimalTextChange(view.state.doc.toString(), normalized),
        annotations: [externalChange.of(true), isolateHistory.of('full')],
      });
  }, [value]);
  return <div className="markdown-editor" ref={container} />;
}

function editorSettings(preferences: Preferences, floating: Extension) {
  const keepsTab = (command: keyof typeof markdownTabKeys) =>
    (preferences.keybindings.find((entry) => entry.command === command)
      ?.keystroke ?? markdownTabKeys[command]) === markdownTabKeys[command];
  return [
    keymap.of([
      ...(keepsTab('editor:indent-more')
        ? [{ key: 'Tab', run: indentMarkdown }]
        : []),
      ...(keepsTab('editor:indent-less')
        ? [{ key: 'Shift-Tab', run: outdentMarkdown }]
        : []),
    ]),
    ...(preferences.lineNumbers
      ? [lineNumbers(), highlightActiveLineGutter()]
      : []),
    foldGutter(),
    ...(preferences.activeLine ? [highlightActiveLine()] : []),
    lineWrappingExtension(preferences.lineWrapping),
    ...(preferences.readableLineLength
      ? [
          EditorView.theme({
            '.cm-content': {
              maxInlineSize: 'var(--inknote-editor-readable-width, 1024px)',
              marginInline: 'auto',
            },
          }),
        ]
      : []),
    ...(preferences.showToolbar && preferences.toolbarPlacement === 'floating'
      ? [floating]
      : []),
    EditorView.contentAttributes.of({
      'aria-label': 'Contenido Markdown de la nota',
      spellcheck: String(preferences.spellcheck),
    }),
  ];
}
