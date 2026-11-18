import {
  Facet,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
} from '@codemirror/state';
import {
  keymap,
  showTooltip,
  type EditorView,
  type Tooltip,
  type ViewUpdate,
} from '@codemirror/view';
import {
  isExternalUrl,
  isLiteralMarkdown,
  linkDestination,
} from './link-paste';

interface LinkMenuOptions {
  fetchTitle: (url: string) => Promise<string | null>;
  autoFetch: () => boolean;
}
interface LinkMenu {
  id: number;
  from: number;
  to: number;
  url: string;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  title: string;
}

const menuOptions = Facet.define<LinkMenuOptions, LinkMenuOptions | null>({
  combine: (values) => values[0] ?? null,
});
const openMenu = StateEffect.define<LinkMenu>();
const closeMenu = StateEffect.define<null>();
const updateTitle =
  StateEffect.define<Pick<LinkMenu, 'id' | 'status' | 'title'>>();

const menuField = StateField.define<LinkMenu | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(openMenu)) return effect.value;
      if (effect.is(closeMenu)) return null;
    }
    if (!value) return null;
    let next = value;
    if (transaction.docChanged) {
      if (transaction.changes.touchesRange(value.from, value.to)) return null;
      next = {
        ...value,
        from: transaction.changes.mapPos(value.from, 1),
        to: transaction.changes.mapPos(value.to, -1),
      };
    }
    if (transaction.selection && transaction.newSelection.main.head !== next.to)
      return null;
    for (const effect of transaction.effects)
      if (effect.is(updateTitle) && effect.value.id === next.id)
        next = { ...next, ...effect.value };
    return next;
  },
});

const currentMenu = (state: EditorState) =>
  state.field(menuField, false) ?? null;

function requestTitle(view: EditorView) {
  const menu = currentMenu(view.state);
  const options = view.state.facet(menuOptions);
  if (!menu || !options || menu.status !== 'idle') return;
  const finish = (title: string | null) => {
    if (!view.dom.isConnected || currentMenu(view.state)?.id !== menu.id)
      return;
    view.dispatch({
      effects: updateTitle.of({
        id: menu.id,
        status: title ? 'ready' : 'failed',
        title: title ?? '',
      }),
    });
  };
  view.dispatch({
    effects: updateTitle.of({ id: menu.id, status: 'loading', title: '' }),
  });
  options.fetchTitle(menu.url).then(finish, () => finish(null));
}

function replaceUrl(
  view: EditorView,
  menu: LinkMenu,
  insert: string,
  cursor: number,
) {
  view.dispatch({
    changes: { from: menu.from, to: menu.to, insert },
    selection: { anchor: menu.from + cursor },
    effects: closeMenu.of(null),
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
  view.focus();
}

function dismiss(view: EditorView) {
  view.dispatch({ effects: closeMenu.of(null) });
  view.focus();
}

function menuButton(label: string, run: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  // Keep the editor's selection while the pointer chooses a format.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', run);
  return button;
}

const createMenu: Tooltip['create'] = (view) => {
  const dom = document.createElement('div');
  dom.className = 'inknote-link-menu';
  dom.setAttribute('role', 'group');
  dom.setAttribute('aria-label', 'Formato del enlace');
  dom.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dismiss(view);
  });
  const keep = menuButton('URL', () => dismiss(view));
  const link = menuButton('Enlace', () => {
    const menu = currentMenu(view.state);
    if (menu) replaceUrl(view, menu, `[](${linkDestination(menu.url)})`, 1);
  });
  const title = menuButton('Buscar título', () => {
    const menu = currentMenu(view.state);
    if (menu?.status === 'idle') {
      requestTitle(view);
      view.focus();
    } else if (menu?.status === 'ready') {
      const label = menu.title.replace(/[\\[\]]/g, '\\$&');
      const insert = `[${label}](${linkDestination(menu.url)})`;
      replaceUrl(view, menu, insert, insert.length);
    }
  });
  const render = (state: EditorState) => {
    const menu = currentMenu(state);
    title.disabled = menu?.status === 'loading' || menu?.status === 'failed';
    title.textContent =
      menu?.status === 'loading'
        ? 'Buscando título…'
        : menu?.status === 'failed'
          ? 'Título no disponible'
          : menu?.status === 'ready'
            ? `Usar «${menu.title}»`
            : 'Buscar título';
    title.title = menu?.status === 'ready' ? menu.title : '';
  };
  dom.append(keep, link, title);
  render(view.state);
  return {
    dom,
    update: (update: ViewUpdate) => render(update.state),
  };
};

export function linkPasteMenu(options: LinkMenuOptions) {
  return [
    menuOptions.of(options),
    menuField,
    showTooltip.compute([menuField], (state) => {
      const menu = state.field(menuField);
      return menu ? { pos: menu.to, above: false, create: createMenu } : null;
    }),
    Prec.high(
      keymap.of([
        {
          key: 'Escape',
          run(view) {
            if (!currentMenu(view.state)) return false;
            dismiss(view);
            return true;
          },
        },
        {
          key: 'Tab',
          run(view) {
            if (!currentMenu(view.state)) return false;
            view.dom
              .querySelector<HTMLElement>('.inknote-link-menu button')
              ?.focus();
            return true;
          },
        },
      ]),
    ),
  ];
}

let nextMenuId = 0;

// A URL pasted at the cursor stays plain text until the user picks a format.
export function pasteUrlAtCursor(view: EditorView, pasted: string) {
  const { state } = view;
  const url = pasted.trim();
  const range = state.selection.main;
  const options = state.facet(menuOptions);
  if (
    !options ||
    state.readOnly ||
    state.selection.ranges.length !== 1 ||
    !range.empty ||
    !isExternalUrl(url) ||
    isLiteralMarkdown(state, range.from, range.from)
  )
    return false;
  const to = range.from + url.length;
  view.dispatch({
    changes: { from: range.from, insert: url },
    selection: { anchor: to },
    effects: openMenu.of({
      id: ++nextMenuId,
      from: range.from,
      to,
      url,
      status: 'idle',
      title: '',
    }),
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
  if (options.autoFetch()) requestTitle(view);
  return true;
}
