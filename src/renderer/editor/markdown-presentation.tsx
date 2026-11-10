import type { ComponentProps, ReactNode } from 'react';
import type { ExtraProps } from 'react-markdown';
import { highlightTree } from '@lezer/highlight';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import {
  Info,
  Lightbulb,
  MessageSquareWarning,
  TriangleAlert,
  OctagonAlert,
} from 'lucide-react';
import { alertLabels, type AlertType } from './github-alerts';
import { tokenHighlighter } from './token-highlighter';

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

export function readMarkdownFence(node: ExtraProps['node']) {
  const code = node?.children[0];
  const element = code?.type === 'element' ? code : undefined;
  const classes = element?.properties.className;
  const language = Array.isArray(classes)
    ? classes.find(
        (value) => typeof value === 'string' && value.startsWith('language-'),
      )
    : undefined;
  const text =
    element?.children
      .filter((child) => child.type === 'text')
      .map((child) => child.value)
      .join('') ?? '';
  return { element, language, text };
}
