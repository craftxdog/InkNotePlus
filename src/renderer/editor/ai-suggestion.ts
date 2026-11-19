import {
  Facet,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type ViewUpdate,
} from '@codemirror/view';

export type AiSuggestionAnswer = { text: string } | { error: string };
export interface AiSuggestionOptions {
  suggest: (input: { before: string; after: string }) => {
    result: Promise<AiSuggestionAnswer>;
    cancel: () => void;
  };
  isAuto: () => boolean;
}
interface Suggestion {
  pos: number;
  text: string;
  error: boolean;
}

const autoDelay = 1200;
const contextBefore = 4000;
const contextAfter = 1000;

const setSuggestion = StateEffect.define<Suggestion | null>();

class GhostText extends WidgetType {
  constructor(
    readonly text: string,
    readonly error: boolean,
  ) {
    super();
  }
  override eq(other: GhostText) {
    return other.text === this.text && other.error === this.error;
  }
  toDOM() {
    const element = document.createElement('span');
    element.className = this.error
      ? 'cm-ai-suggestion cm-ai-suggestion--error'
      : 'cm-ai-suggestion';
    element.textContent = this.text;
    return element;
  }
  override ignoreEvent() {
    return true;
  }
}

const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setSuggestion)) return effect.value;
    return transaction.docChanged || transaction.selection ? null : value;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) =>
      value
        ? Decoration.set(
            Decoration.widget({
              widget: new GhostText(value.text, value.error),
              side: 1,
            }).range(value.pos),
          )
        : Decoration.none,
    ),
});

export const currentAiSuggestion = (state: EditorState) =>
  state.field(suggestionField, false) ?? null;

const optionsFacet = Facet.define<AiSuggestionOptions, AiSuggestionOptions>({
  combine: (values) => values[0],
});

const suggestionPlugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined;
    cancelRequest: (() => void) | null = null;

    constructor(readonly view: EditorView) {}

    stop() {
      clearTimeout(this.timer);
      this.cancelRequest?.();
      this.cancelRequest = null;
    }

    request(showErrors: boolean) {
      this.stop();
      const { state } = this.view;
      const selection = state.selection.main;
      if (!selection.empty) return false;
      const pos = selection.head;
      const request = state.facet(optionsFacet).suggest({
        before: state.sliceDoc(Math.max(0, pos - contextBefore), pos),
        after: state.sliceDoc(pos, pos + contextAfter),
      });
      const cancel = request.cancel;
      this.cancelRequest = cancel;
      void request.result.then((answer) => {
        if (this.cancelRequest !== cancel) return;
        this.cancelRequest = null;
        const failed = 'error' in answer;
        if (failed ? !showErrors : !answer.text) return;
        this.view.dispatch({
          effects: setSuggestion.of({
            pos,
            text: failed ? answer.error : answer.text,
            error: failed,
          }),
        });
      });
      return true;
    }

    update(update: ViewUpdate) {
      if (!update.docChanged && !update.selectionSet) return;
      this.stop();
      const typed = update.transactions.some((transaction) =>
        transaction.isUserEvent('input.type'),
      );
      if (typed && update.state.facet(optionsFacet).isAuto())
        this.timer = setTimeout(() => this.request(false), autoDelay);
    }

    destroy() {
      this.stop();
    }
  },
);

export function requestAiSuggestion(view: EditorView) {
  return !!view.plugin(suggestionPlugin)?.request(true);
}

function accept(view: EditorView) {
  const suggestion = currentAiSuggestion(view.state);
  if (!suggestion || suggestion.error) return false;
  view.dispatch({
    changes: { from: suggestion.pos, insert: suggestion.text },
    selection: { anchor: suggestion.pos + suggestion.text.length },
    userEvent: 'input.complete',
  });
  return true;
}

function dismiss(view: EditorView) {
  if (!currentAiSuggestion(view.state)) return false;
  view.dispatch({ effects: setSuggestion.of(null) });
  return true;
}

export function aiSuggestion(options: AiSuggestionOptions) {
  return [
    optionsFacet.of(options),
    suggestionField,
    suggestionPlugin,
    Prec.highest(
      keymap.of([
        { key: 'Tab', run: accept },
        { key: 'Escape', run: dismiss },
      ]),
    ),
    EditorView.baseTheme({
      '.cm-ai-suggestion': { opacity: '0.5', whiteSpace: 'pre-wrap' },
      '.cm-ai-suggestion--error': {
        color: 'var(--danger, #c0392b)',
        opacity: '0.85',
        marginInlineStart: '8px',
      },
    }),
  ];
}
