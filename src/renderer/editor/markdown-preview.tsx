import {
  memo,
  useDeferredValue,
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
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
  MarkdownAlert,
  readMarkdownFence,
} from './markdown-presentation';

const gfm = [
  remarkGfm,
  remarkMath,
  remarkGithubAlerts,
  remarkHighlights,
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
  useEffect(() => rendered.current?.(deferredBody), [deferredBody]);
  const openLink = useWorkspace((state) => state.openExternalLink);
  const openNoteLink = useWorkspace((state) => state.openNoteLink);
  const toggle = useWorkspace((state) => state.toggleTask);
  return (
    <PreviewContext
      value={{
        body: deferredBody,
        disabled: readOnly || body !== deferredBody,
        toggle,
        openLink,
        openNoteLink,
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
function PreviewLink({ href, children }: ComponentProps<'a'>) {
  const context = useContext(PreviewContext)!;
  return (
    <a
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault();
        if (href && linkedNoteId(href)) void context.openNoteLink(href);
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
  const { width, height, caption } = parseImageDimensions(alt ?? '');
  if (typeof src !== 'string' || !managedImageUrlPattern.test(src))
    return (
      <span className="blocked-image">
        {caption ? `[Imagen: ${caption}]` : '[Imagen]'}
      </span>
    );
  return (
    <img
      {...props}
      src={src}
      alt={caption}
      title={title}
      style={{ width, height }}
      decoding="async"
      loading="lazy"
    />
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

function PreviewBlock({ node, children }: ComponentProps<'pre'> & ExtraProps) {
  const { element, language, text } = readMarkdownFence(node);
  const math = useWorkspace((state) => state.preferences.mathEnabled);
  const mermaid = useWorkspace((state) => state.preferences.mermaidEnabled);
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
  return <pre {...source}>{children}</pre>;
}
