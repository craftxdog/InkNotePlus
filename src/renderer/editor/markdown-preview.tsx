import {
  memo,
  useDeferredValue,
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type ComponentProps,
} from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlightTree } from '@lezer/highlight';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { tokenHighlighter } from './token-highlighter';
import { useWorkspace } from '../state/workspace-context';
import { remarkSourceMap } from './markdown-source-map';

const gfm = [remarkGfm, remarkSourceMap];
const PreviewContext = createContext<{
  body: string;
  disabled: boolean;
  toggle: (body: string, offset: number, checked: boolean) => void;
  openLink: (url: string) => unknown;
} | null>(null);
const TaskOffsetContext = createContext<number | null>(null);

export const MarkdownPreview = memo(function MarkdownPreview({
  body,
  readOnly = false,
  onRendered,
}: {
  body: string;
  readOnly?: boolean;
  onRendered?: () => void;
}) {
  const deferredBody = useDeferredValue(body);
  const rendered = useRef(onRendered);
  rendered.current = onRendered;
  useEffect(() => rendered.current?.(), [deferredBody]);
  const openLink = useWorkspace((state) => state.openExternalLink);
  const toggle = useWorkspace((state) => state.toggleTask);
  return (
    <PreviewContext
      value={{
        body: deferredBody,
        disabled: readOnly || body !== deferredBody,
        toggle,
        openLink,
      }}
    >
      <div className="mde-preview" aria-label="Vista previa Markdown">
        <Markdown remarkPlugins={gfm} skipHtml components={components}>
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
        if (href) void context.openLink(href);
      }}
    >
      {children}
    </a>
  );
}
const components: Components = {
  li: PreviewListItem,
  input: PreviewCheckbox,
  a: PreviewLink,
  img: ({ alt }) => (
    <span className="blocked-image">
      {alt ? `[Imagen: ${alt}]` : '[Imagen]'}
    </span>
  ),
  code: ({ children, className }) => (
    <HighlightedCode className={className}>{String(children)}</HighlightedCode>
  ),
};

function HighlightedCode({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const name = className?.replace('language-', '');
  const language = /^(js|javascript|ts|typescript|jsx|tsx)$/.test(name ?? '')
    ? javascriptLanguage
    : name === 'json'
      ? jsonLanguage
      : null;
  if (!language) return <code className={className}>{children}</code>;
  const spans: ReactNode[] = [];
  let offset = 0;
  highlightTree(
    language.parser.parse(children),
    tokenHighlighter,
    (from, to, classes) => {
      if (from > offset) spans.push(children.slice(offset, from));
      spans.push(
        <span className={classes} key={`${from}:${to}`}>
          {children.slice(from, to)}
        </span>,
      );
      offset = to;
    },
  );
  spans.push(children.slice(offset));
  return <code className={`codeblock ${className ?? ''}`}>{spans}</code>;
}
