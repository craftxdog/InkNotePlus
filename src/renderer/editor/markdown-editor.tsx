import { useEffect, useRef } from 'react';
import { Annotation, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
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
  syntaxHighlighting,
} from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { tokenHighlighter } from './token-highlighter';
import { minimalTextChange } from './markdown-source-map';

const externalChange = Annotation.define<boolean>();

export function MarkdownEditor({
  value,
  nonce,
  onChange,
  onSave,
  onView,
  onUpdate,
}: {
  value: string;
  nonce: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onView: (view: EditorView | null) => void;
  onUpdate?: (selectionChanged: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave, onView, onUpdate });
  callbacks.current = { onChange, onSave, onView, onUpdate };
  const initialValue = useRef(value);
  useEffect(() => {
    if (!container.current) return;
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          EditorView.cspNonce.of(nonce),
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
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
              lineHeight: '1.6',
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
          }),
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          EditorView.lineWrapping,
          markdown({
            base: markdownLanguage,
            codeLanguages: (info) =>
              /^(js|javascript|ts|typescript|jsx|tsx)$/.test(info)
                ? javascriptLanguage
                : info === 'json'
                  ? jsonLanguage
                  : null,
          }),
          syntaxHighlighting(tokenHighlighter),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.contentAttributes.of({
            'aria-label': 'Contenido Markdown de la nota',
            spellcheck: 'true',
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged ||
              update.selectionSet ||
              update.geometryChanged ||
              update.viewportChanged
            )
              callbacks.current.onUpdate?.(
                update.docChanged || update.selectionSet,
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
  }, [nonce]);
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
