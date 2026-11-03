import { memo, useDeferredValue, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlightTree } from '@lezer/highlight';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { tokenHighlighter } from './token-highlighter';
import { useWorkspace } from '../state/workspace-context';

const gfm = [remarkGfm];

export const MarkdownPreview = memo(function MarkdownPreview({
  body,
}: {
  body: string;
}) {
  const deferredBody = useDeferredValue(body);
  const openLink = useWorkspace((state) => state.openExternalLink);
  return (
    <div className="mde-preview" aria-label="Vista previa Markdown">
      <Markdown
        remarkPlugins={gfm}
        skipHtml
        components={{
          img: ({ alt }) => (
            <span className="blocked-image">
              {alt ? `[Imagen: ${alt}]` : '[Imagen]'}
            </span>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (href) void openLink(href);
              }}
              title={href}
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => (
            <HighlightedCode className={className}>
              {String(children)}
            </HighlightedCode>
          ),
        }}
      >
        {deferredBody}
      </Markdown>
    </div>
  );
});

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
