import {
  memo,
  useDeferredValue,
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
import { remarkSourceMap, rehypeSourceText } from './markdown-source-map';
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
const PreviewContext = createContext<{
  body: string;
  disabled: boolean;
  toggle: (body: string, offset: number, checked: boolean) => void;
  openLink: (url: string) => unknown;
  openNoteLink: (url: string) => unknown;
  noteId: string | null;
} | null>(null);
const TaskOffsetContext = createContext<number | null>(null);

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
  return (
    <PreviewContext
      value={{
        body: deferredBody,
        disabled: readOnly || body !== deferredBody,
        toggle,
        openLink,
        openNoteLink,
        // Read-only previews belong to templates and revisions, not to a note.
        noteId: readOnly ? null : noteId,
      }}
    >
      <div className="mde-preview" aria-label="Vista previa Markdown">
        <Markdown
          remarkPlugins={gfm}
          rehypePlugins={sourceText}
          skipHtml
          components={components}
          urlTransform={(url, key) =>
            (key === 'src' && managedImageUrlPattern.test(url)) ||
            (key === 'href' && linkedNoteId(url))
              ? url
              : defaultUrlTransform(url)
          }
        >
          {deferredBody}
        </Markdown>
      </div>
    </PreviewContext>
  );
});

function PreviewListItem({
  node,
  children,
  ...props
}: ComponentProps<'li'> & ExtraProps) {
  const value = node?.properties['data-task-offset'];
  return (
    <TaskOffsetContext value={typeof value === 'number' ? value : null}>
      <li {...props}>{children}</li>
    </TaskOffsetContext>
  );
}
function PreviewCheckbox() {
  const offset = useContext(TaskOffsetContext),
    context = useContext(PreviewContext)!;
  const text =
    offset === null
      ? ''
      : context.body
          .slice(offset + 2)
          .split(/\r?\n/, 1)[0]
          .trim();
  return (
    <input
      type="checkbox"
      checked={offset !== null && context.body[offset] !== ' '}
      disabled={context.disabled || offset === null}
      aria-label={`Tarea: ${text}`}
      onChange={(event) => {
        if (offset !== null)
          context.toggle(context.body, offset, event.target.checked);
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
          const anchors = event.currentTarget
            .closest('.mde-preview')
            ?.querySelectorAll('[id]');
          [...(anchors ?? [])]
            .find((anchor) => anchor.id === id)
            ?.scrollIntoView({ block: 'center' });
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
        {preview?.noteId && !preview.disabled && (
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
