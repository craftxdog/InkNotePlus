import type { Completion, CompletionSection } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { completionIcons } from './markdown-completion-icons';

export function completionSectionHeader(section: CompletionSection) {
  const header = document.createElement('li');
  header.className = 'inknote-completion-section';
  header.setAttribute('role', 'presentation');
  header.textContent = section.name;
  return header;
}

export function completionIcon(
  completion: Completion,
  _state: EditorState,
  view: EditorView,
) {
  if (!completion.type?.startsWith('inknote-')) return null;
  const name = completion.type.slice('inknote-'.length);
  if (!Object.hasOwn(completionIcons, name)) return null;
  const document = view.dom.ownerDocument;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: `inknote-completion-icon inknote-completion-${name}`,
  }))
    svg.setAttribute(key, value);
  for (const [tag, attributes] of completionIcons[
    name as keyof typeof completionIcons
  ]) {
    const child = document.createElementNS(svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(attributes))
      child.setAttribute(key, value);
    svg.append(child);
  }
  return svg;
}

// CodeMirror owns listbox focus, filtering, selection and tooltip placement.
// https://codemirror.net/docs/ref/#autocomplete.CompletionConfig.addToOptions
export const completionPresentation = {
  tooltipClass: () => 'inknote-completion-menu',
  optionClass: (completion: Completion) =>
    completion.type?.startsWith('inknote-') ? 'inknote-command-option' : '',
  addToOptions: [{ render: completionIcon, position: 20 }],
};

// Component tokens shipped by @inkdropapp/css/syntax.css. Themes supply values;
// CodeMirror's supported theme extension supplies the tooltip's scoped rules.
// https://github.com/inkdropapp/css/blob/main/syntax.css
export const completionTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete.inknote-completion-menu': {
    backgroundColor: 'var(--editor-tooltip-background-color)',
    color: 'var(--editor-completion-label)',
    border:
      'var(--editor-tooltip-border-width) var(--editor-tooltip-border-style) var(--editor-tooltip-border-color)',
    borderRadius: 'var(--editor-tooltip-border-radius)',
    boxShadow: 'var(--editor-tooltip-box-shadow)',
    overflow: 'hidden',
    fontFamily: 'var(--page-font)',
    fontSize: 'var(--font-size)',
    maxWidth: 'calc(100vw - 16px)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.inknote-completion-menu > ul': {
    fontFamily: 'var(--page-font)',
    fontSize: 'var(--font-size)',
    lineHeight: 'var(--line-height)',
    padding: 'var(--editor-tooltip-autocomplete-padding)',
    minWidth: 'min(24rem, calc(100vw - 16px))',
    maxHeight: 'min(22rem, calc(100dvh - 24px))',
    boxSizing: 'border-box',
  },
  '.inknote-completion-menu > ul > li[role=option]': {
    padding: 'var(--editor-tooltip-autocomplete-item-padding)',
    borderRadius: 'var(--editor-tooltip-autocomplete-item-border-radius)',
    minHeight: '2em',
    lineHeight: 'var(--line-height)',
    alignContent: 'center',
  },
  '.inknote-completion-menu > ul > li.inknote-command-option': {
    display: 'grid',
    gridTemplateColumns: '1.3em minmax(0, 1fr) auto',
    alignItems: 'center',
    columnGap: 'var(--8px)',
  },
  '.inknote-command-option .cm-completionIcon': { display: 'none' },
  '.inknote-completion-icon': {
    display: 'block',
    width: '1.1em',
    height: '1.1em',
    color: 'currentColor',
  },
  '.inknote-completion-menu .cm-completionLabel': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.inknote-completion-menu .cm-completionDetail': {
    color: 'var(--editor-completion-detail-color)',
    fontFamily: 'var(--editor-font-family, ui-monospace, monospace)',
    fontSize: 'var(--small)',
    marginLeft: 'var(--8px)',
    fontStyle: 'var(--editor-completion-detail-font-style)',
    fontWeight: 'var(--editor-completion-detail-font-weight)',
    textDecoration: 'var(--editor-completion-detail-text-decoration)',
  },
  '.inknote-completion-menu .cm-completionMatchedText': {
    color: 'var(--editor-completion-matched-text-color)',
    fontWeight: 'var(--editor-completion-matched-text-font-weight)',
    fontStyle: 'var(--editor-completion-matched-text-font-style)',
    textDecoration: 'var(--editor-completion-matched-text-decoration)',
  },
  '.cm-tooltip-autocomplete.inknote-completion-menu > ul > li[aria-selected=true]':
    {
      backgroundColor:
        'var(--editor-tooltip-autocomplete-item-selected-background-color)',
      color: 'var(--editor-tooltip-autocomplete-item-selected-color)',
    },
  '.inknote-completion-menu > ul > li[aria-selected=true] .cm-completionDetail, .inknote-completion-menu > ul > li[aria-selected=true] .cm-completionMatchedText':
    {
      color: 'inherit',
    },
  '.inknote-completion-menu > ul > li.inknote-completion-section': {
    display: 'list-item',
    fontFamily: 'var(--page-font)',
    fontSize: 'var(--small)',
    fontWeight: '500',
    color: 'var(--editor-completion-label)',
    padding: 'var(--4px) var(--8px)',
    marginBlock: 'var(--4px)',
    borderBottom:
      '1px solid var(--editor-tooltip-autocomplete-section-border-color)',
  },
  ...Object.fromEntries(
    ['note', 'tip', 'important', 'warning', 'caution'].map((type) => [
      `.inknote-completion-icon.inknote-completion-${type}`,
      { color: `var(--gfm-alert-${type})` },
    ]),
  ),
});
