import {
  memo,
  useDeferredValue,
  useMemo,
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
  lazy,
  Suspense,
} from 'react';
import Markdown, {
  defaultUrlTransform,
  type Components,
  type ExtraProps,
} from 'react-markdown';
import { managedImageUrlPattern } from '../../shared/images';
import { parseImageDimensions } from './image-dimensions';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { useWorkspace } from '../state/workspace-context';
import {
  remarkLineOffset,
  remarkSourceMap,
  rehypeSourceText,
} from './markdown-source-map';
import { splitMarkdownBlocks } from './markdown-blocks';
import { findHeading } from './heading-slug';
import { remarkHighlights } from './highlights';
import { linkedNoteId } from '../../shared/note-link';
import { remarkGithubAlerts } from './github-alerts';
import {
  HighlightedCode,
  FencedCodeBlock,
  MarkdownAlert,
  readMarkdownFence,
} from './markdown-presentation';
import { remarkCodeFenceMeta } from './code-fence';
import { remarkEmoji } from './remark-emoji';

const gfm = [
  remarkGfm,
  remarkMath,
  remarkGithubAlerts,
  remarkHighlights,
  remarkCodeFenceMeta,
  remarkEmoji,
  remarkSourceMap,
];
const sourceText = [rehypeSourceText];
const Equation = lazy(() => import('./math-equation'));
const Diagram = lazy(() => import('./mermaid-diagram'));
// Stable actions. The rendered text lives in its own context, so typing does
// not re-render code blocks, links or diagrams in unchanged blocks.
const PreviewContext = createContext<{
  toggle: (body: string, offset: number, checked: boolean) => void;
  openLink: (url: string) => unknown;
  openNoteLink: (url: string) => unknown;
  noteId: string | null;
} | null>(null);
const PreviewStateContext = createContext({ body: '', disabled: true });
const TaskOffsetContext = createContext<number | null>(null);
// Source offset of the preview block being rendered.
const BlockOffsetContext = createContext(0);
const transformUrl = (url: string, key: string) =>
  (key === 'src' && managedImageUrlPattern.test(url)) ||
  (key === 'href' && linkedNoteId(url))
    ? url
    : defaultUrlTransform(url);

// Parsing dominates typing in long notes. Each top-level block parses on its
// own, so a keystroke only parses the block it changes. Text inserted above a
// block shifts its offsets, which are read through BlockOffsetContext instead.
const PreviewMarkdownBlock = memo(function PreviewMarkdownBlock({
  text,
  line,
}: {
  text: string;
  line: number;
}) {
  const plugins = useMemo(
    () => [[remarkLineOffset, { line }] as const, ...gfm],
    [line],
  );
  return (
    <Markdown
      remarkPlugins={plugins as never}
      rehypePlugins={sourceText}
      skipHtml
      components={components}
      urlTransform={transformUrl}
    >
      {text}
    </Markdown>
  );
});
// Keys that survive edits: unchanged blocks at both ends keep theirs, and
// edited blocks reuse the keys in between, so React updates them in place
// (keeping, for example, a code block's DOM) instead of remounting them.
function useBlockKeys(texts: readonly string[]) {
  const previous = useRef<{ texts: readonly string[]; keys: number[] }>({
    texts: [],
    keys: [],
  });
  const next = useRef(0);
  return useMemo(() => {
    const old = previous.current;
    let head = 0;
    while (
      head < texts.length &&
      head < old.texts.length &&
      texts[head] === old.texts[head]
    )
      head++;
    let tail = 0;
    while (
      tail < texts.length - head &&
      tail < old.texts.length - head &&
      texts[texts.length - 1 - tail] === old.texts[old.texts.length - 1 - tail]
    )
      tail++;
    const middle = old.keys.slice(head, old.keys.length - tail);
    const keys = texts.map((_, index) => {
      if (index < head) return old.keys[index];
      if (index >= texts.length - tail)
        return old.keys[old.keys.length - (texts.length - index)];
      return middle[index - head] ?? next.current++;
    });
    for (const key of keys) next.current = Math.max(next.current, key + 1);
    previous.current = { texts, keys };
    return keys;
  }, [texts]);
}

export const MarkdownPreview = memo(function MarkdownPreview({
  body,
  readOnly = false,
  onRendered,
}: {
  body: string;
  readOnly?: boolean;
  onRendered?: (body: string) => void;
}) {
  const deferredBody = useDeferredValue(body);
  const rendered = useRef(onRendered);
  rendered.current = onRendered;
  // The new preview and its scroll position must reach the same paint.
  // https://react.dev/reference/react/useLayoutEffect
  useLayoutEffect(() => rendered.current?.(deferredBody), [deferredBody]);
  const openLink = useWorkspace((state) => state.openExternalLink);
  const openNoteLink = useWorkspace((state) => state.openNoteLink);
  const toggle = useWorkspace((state) => state.toggleTask);
  const noteId = useWorkspace((state) => state.document.noteId);
  const blocks = useMemo(
    () => splitMarkdownBlocks(deferredBody),
    [deferredBody],
  );
  const keys = useBlockKeys(
    useMemo(() => blocks.map((block) => block.text), [blocks]),
  );
  const actions = useMemo(
    () => ({
      toggle,
      openLink,
      openNoteLink,
      // Read-only previews belong to templates and revisions, not to a note.
      noteId: readOnly ? null : noteId,
    }),
    [toggle, openLink, openNoteLink, readOnly, noteId],
  );
  const disabled = readOnly || body !== deferredBody;
  const state = useMemo(
    () => ({ body: deferredBody, disabled }),
    [deferredBody, disabled],
  );
  return (
    <PreviewContext value={actions}>
      <PreviewStateContext value={state}>
        <div className="mde-preview" aria-label="Vista previa Markdown">
          {blocks.map((block, index) => (
            <BlockOffsetContext key={keys[index]} value={block.offset}>
              <PreviewMarkdownBlock text={block.text} line={block.line} />
            </BlockOffsetContext>
          ))}
        </div>
      </PreviewStateContext>
    </PreviewContext>
  );
});

function PreviewListItem({
  node,
  children,
  'data-task-offset': _offset,
  ...props
}: ComponentProps<'li'> & ExtraProps & { 'data-task-offset'?: unknown }) {
  const value = node?.properties['data-task-offset'];
  const block = useContext(BlockOffsetContext);
  return (
    <TaskOffsetContext value={typeof value === 'number' ? block + value : null}>
      <li {...props}>{children}</li>
    </TaskOffsetContext>
  );
}
function PreviewCheckbox() {
  const offset = useContext(TaskOffsetContext),
    context = useContext(PreviewContext)!,
    { body, disabled } = useContext(PreviewStateContext);
  const text =
    offset === null
      ? ''
      : body
          .slice(offset + 2)
          .split(/\r?\n/, 1)[0]
          .trim();
  return (
    <input
      type="checkbox"
      checked={offset !== null && body[offset] !== ' '}
      disabled={disabled || offset === null}
      aria-label={`Tarea: ${text}`}
      onChange={(event) => {
        if (offset !== null) context.toggle(body, offset, event.target.checked);
      }}
    />
  );
}
function PreviewLink({
  node: _node,
  href,
  children,
  ...props
}: ComponentProps<'a'> & ExtraProps) {
  const context = useContext(PreviewContext)!;
  return (
    <a
      {...props}
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault();
        if (href?.startsWith('#')) {
          const id = href.slice(1);
          const container = event.currentTarget.closest('.mde-preview');
          const anchors = container?.querySelectorAll('[id]');
          (
            [...(anchors ?? [])].find((anchor) => anchor.id === id) ??
            (container && findHeading(container, id))
          )?.scrollIntoView({ block: 'center' });
        } else if (href && linkedNoteId(href)) void context.openNoteLink(href);
        else if (href) void context.openLink(href);
      }}
    >
      {children}
    </a>
  );
}
const components: Components = {
  div: MarkdownAlert,
  pre: PreviewBlock,
  li: PreviewListItem,
  input: PreviewCheckbox,
  a: PreviewLink,
  img: PreviewImage,
  code: PreviewCode,
};

function PreviewImage({
  node: _node,
  src,
  alt,
  title,
  ...props
}: ComponentProps<'img'> & ExtraProps) {
  const openViewer = useWorkspace((state) => state.setImageViewer);
  const { width, height, caption } = parseImageDimensions(alt ?? '');
  const remote = typeof src === 'string' ? remoteImage(src) : null;
  const preview = useContext(PreviewContext);
  const { disabled } = useContext(PreviewStateContext);
  const allowNote = useWorkspace((state) => state.allowRemoteImages);
  const allowed = useWorkspace(
    (state) =>
      state.preferences.remoteImages === 'allowed' ||
      (!!preview?.noteId &&
        state.preferences.remoteImageNotes.includes(preview.noteId)),
  );
  if (typeof src !== 'string') return <BlockedImage caption={caption} />;
  if (remote && !remote.secure)
    return (
      <BlockedImage caption={caption}>
        Imagen sin cifrar de {remote.host}, bloqueada.
      </BlockedImage>
    );
  if (remote && !allowed)
    return (
      <BlockedImage caption={caption}>
        Imagen externa de {remote.host}.{' '}
        {preview?.noteId && !disabled && (
          <button
            type="button"
            className="link-button"
            onClick={() => allowNote(preview.noteId!)}
          >
            Mostrar imágenes de esta nota
          </button>
        )}
      </BlockedImage>
    );
  if (!remote && !managedImageUrlPattern.test(src))
    return <BlockedImage caption={caption} />;
  return (
    <img
      {...props}
      src={src}
      // A remote site must not learn which note shows its image.
      referrerPolicy={remote ? 'no-referrer' : undefined}
      alt={caption}
      title={title ?? 'Doble clic para ampliar'}
      style={{ width, height }}
      decoding="async"
      loading="lazy"
      tabIndex={0}
      onDoubleClick={() => openViewer({ src, alt: caption })}
      onKeyDown={(event) => {
        if (event.key === 'Enter') openViewer({ src, alt: caption });
      }}
    />
  );
}

function remoteImage(src: string) {
  if (!/^https?:\/\//i.test(src) || !URL.canParse(src)) return null;
  const url = new URL(src);
  return { host: url.host, secure: url.protocol === 'https:' };
}

function BlockedImage({
  caption,
  children,
}: {
  caption: string;
  children?: ReactNode;
}) {
  return (
    <span className="blocked-image">
      {caption ? `[Imagen: ${caption}]` : '[Imagen]'}
      {children && <span className="blocked-image-reason"> {children}</span>}
    </span>
  );
}

function PreviewCode({ children, className }: ComponentProps<'code'>) {
  const math = useWorkspace((state) => state.preferences.mathEnabled);
  return className?.includes('math-inline') && math ? (
    <Suspense fallback={<code>{children}</code>}>
      <Equation code={String(children)} inline />
    </Suspense>
  ) : (
    <HighlightedCode className={className}>{String(children)}</HighlightedCode>
  );
}

function PreviewBlock({ node }: ComponentProps<'pre'> & ExtraProps) {
  const { element, language, text, metadata } = readMarkdownFence(node);
  const math = useWorkspace((state) => state.preferences.mathEnabled);
  const mermaid = useWorkspace((state) => state.preferences.mermaidEnabled);
  const lineNumbers = useWorkspace(
    (state) => state.preferences.codeLineNumbers,
  );
  const context = useContext(PreviewContext);
  // Code fences own their source positions; react-markdown puts them on code.
  const source = element
    ? Object.fromEntries(
        Object.entries(element.properties).filter(([name]) =>
          name.startsWith('data-source-'),
        ),
      )
    : {};
  if (language === 'language-math' && math)
    return (
      <div {...source} className="math-block">
        <Suspense fallback={<code>{text}</code>}>
          <Equation code={text} />
        </Suspense>
      </div>
    );
  if (language === 'language-mermaid' && mermaid)
    return (
      <div {...source} className="mermaid-block">
        <Suspense
          fallback={
            <pre>
              <code>{text}</code>
            </pre>
          }
        >
          <Diagram code={text} />
        </Suspense>
      </div>
    );
  return (
    <FencedCodeBlock
      language={language}
      text={text}
      metadata={metadata}
      source={source}
      onOpenLink={context?.openLink}
      lineNumbers={lineNumbers}
      copyable
    />
  );
}
