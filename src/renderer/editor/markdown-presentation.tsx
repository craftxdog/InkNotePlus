import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import type { ExtraProps } from 'react-markdown';
import { highlightTree } from '@lezer/highlight';
import type { LanguageDescription } from '@codemirror/language';
import {
  Info,
  Lightbulb,
  MessageSquareWarning,
  TriangleAlert,
  OctagonAlert,
  FileCode2,
  ExternalLink,
} from 'lucide-react';
import { alertLabels, type AlertType } from './github-alerts';
import { tokenHighlighter } from './token-highlighter';
import { resolveCodeLanguage } from './code-languages';
import { parseCodeFenceMeta, type CodeFenceMeta } from './code-fence';

const alertIcons = {
  note: Info,
  tip: Lightbulb,
  important: MessageSquareWarning,
  warning: TriangleAlert,
  caution: OctagonAlert,
};

export function MarkdownAlert({
  node,
  children,
  ...props
}: ComponentProps<'div'> & ExtraProps) {
  const value = node?.properties['data-alert-type'];
  if (typeof value !== 'string' || !Object.hasOwn(alertLabels, value))
    return <div {...props}>{children}</div>;
  const type = value as AlertType;
  const Icon = alertIcons[type];
  return (
    <div {...props} role="note" aria-label={alertLabels[type]}>
      <p className="gfm-alert-title">
        <span className="icon" aria-hidden="true">
          <Icon size="1em" />
        </span>
        {alertLabels[type]}
      </p>
      {children}
    </div>
  );
}

export function HighlightedCode({
  children,
  className,
  block = false,
}: {
  children: string;
  className?: string;
  block?: boolean;
}) {
  const description = resolveCodeLanguage(
    className?.replace(/^language-/, '') ?? '',
  );
  const [loaded, setLoaded] = useState<LanguageDescription | null>(null);
  useEffect(() => {
    if (!description || description.support) return;
    let active = true;
    void description
      .load()
      .then((support) => {
        if (active && support) setLoaded(description);
      })
      .catch(() => {
        // Keep code readable offline or when an optional grammar cannot load.
      });
    return () => {
      active = false;
    };
  }, [description]);
  const language =
    description?.support?.language ??
    (loaded === description ? loaded?.support?.language : null);
  const spans = useMemo(() => {
    if (!language) return children;
    const result: ReactNode[] = [];
    let offset = 0;
    highlightTree(
      language.parser.parse(children),
      tokenHighlighter,
      (from, to, classes) => {
        if (from > offset) result.push(children.slice(offset, from));
        result.push(
          <span className={classes} key={`${from}:${to}`}>
            {children.slice(from, to)}
          </span>,
        );
        offset = to;
      },
    );
    result.push(children.slice(offset));
    return result;
  }, [children, language]);
  return (
    <code
      className={
        [block && 'mde-preview-code-body', className]
          .filter(Boolean)
          .join(' ') || undefined
      }
    >
      {spans}
    </code>
  );
}

export function FencedCodeBlock({
  language,
  text,
  metadata,
  source,
  onOpenLink,
}: {
  language?: string;
  text: string;
  metadata: CodeFenceMeta;
  source?: Record<string, unknown>;
  onOpenLink?: (url: string) => unknown;
}) {
  const name = language?.replace(/^language-/, '');
  const description = resolveCodeLanguage(name ?? '');
  const { title, filename, line, commit, url } = metadata;
  const hasMetadata = Object.keys(metadata).length > 0;
  const lineCount = Math.max(
    1,
    text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
  );
  const numbers =
    line === undefined
      ? null
      : Array.from({ length: lineCount }, (_, index) =>
          String(BigInt(line) + BigInt(index)),
        ).join('\n');
  return (
    <div {...source} className="codeblock">
      {hasMetadata && (
        <div className="codeblock-meta">
          <span
            className="codeblock-meta-icon"
            role="img"
            aria-label={description?.name ?? name ?? 'Código'}
          >
            <FileCode2 size="1.25em" aria-hidden="true" />
            {name && (
              <span className="codeblock-language" aria-hidden="true">
                {name}
              </span>
            )}
          </span>
          <div className="codeblock-meta-body">
            {title && <div className="codeblock-title">{title}</div>}
            {filename && <div className="codeblock-filename">{filename}</div>}
            {(line !== undefined || commit || url) && (
              <div className="codeblock-info">
                {line !== undefined && <span>Línea {line}</span>}
                {commit && <span>Commit {commit}</span>}
                {url && (
                  <a
                    href={url}
                    title={url}
                    onClick={
                      onOpenLink
                        ? (event) => {
                            event.preventDefault();
                            void onOpenLink(url);
                          }
                        : undefined
                    }
                  >
                    Ver origen <ExternalLink size="1em" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <pre
        className={`mde-preview-code${numbers === null ? '' : ' with-line-numbers'}`}
      >
        {numbers !== null && (
          <span className="mde-preview-code-line-number" aria-hidden="true">
            {numbers}
          </span>
        )}
        <HighlightedCode className={language} block>
          {text}
        </HighlightedCode>
      </pre>
    </div>
  );
}

export function readMarkdownFence(node: ExtraProps['node']) {
  const code = node?.children[0];
  const element = code?.type === 'element' ? code : undefined;
  const classes = element?.properties.className;
  const language = Array.isArray(classes)
    ? classes.find(
        (value) => typeof value === 'string' && value.startsWith('language-'),
      )
    : undefined;
  // CodeMirror normalizes line endings on the first edit. Render identical
  // fence content identically so that edit cannot remount a diagram or formula.
  const text = (
    element?.children
      .filter((child) => child.type === 'text')
      .map((child) => child.value)
      .join('') ?? ''
  ).replace(/\r\n?/g, '\n');
  const meta = element?.properties['data-code-meta'];
  const metadata = parseCodeFenceMeta(typeof meta === 'string' ? meta : '');
  return {
    element,
    language: typeof language === 'string' ? language : undefined,
    text,
    metadata,
  };
}
