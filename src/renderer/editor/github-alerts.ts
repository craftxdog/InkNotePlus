import type { SourceNode } from './markdown-source-map';

export const alertLabels = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
} as const;
export type AlertType = keyof typeof alertLabels;

export function alertTypeFromMarker(marker: string): AlertType | null {
  const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][\t ]*$/.exec(
    marker,
  );
  return match ? (match[1].toLowerCase() as AlertType) : null;
}

// GitHub alerts are top-level blockquotes. Keep all original block positions;
// only the removed marker's paragraph/text start moves to the body.
// https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
export function remarkGithubAlerts() {
  return (tree: SourceNode, file: { value: unknown }) => {
    const source = String(file.value);
    for (const quote of tree.children ?? []) {
      const paragraph = quote.children?.[0];
      const position = paragraph?.position;
      const start = position?.start.offset;
      if (
        quote.type !== 'blockquote' ||
        paragraph?.type !== 'paragraph' ||
        start === undefined ||
        !position ||
        position.start.line !== quote.position?.start.line
      )
        continue;
      const newline = source.indexOf('\n', start);
      const end = newline < 0 ? source.length : newline;
      const type = alertTypeFromMarker(
        source.slice(start, end).replace(/\r$/, ''),
      );
      if (!type) continue;
      const nextLine = newline < 0 ? end : newline + 1;
      const prefix = /^ {0,3}>[\t ]?/.exec(source.slice(nextLine));
      const bodyStart = nextLine + (prefix?.[0].length ?? 0);
      const bodyPoint = {
        offset: bodyStart,
        line: position.start.line + 1,
        column: bodyStart - nextLine + 1,
      };
      paragraph.children = (paragraph.children ?? []).filter((child) => {
        const childStart = child.position?.start.offset;
        const childEnd = child.position?.end.offset;
        if (childEnd !== undefined && childEnd <= bodyStart) return false;
        if (
          child.type === 'text' &&
          childStart !== undefined &&
          childStart < bodyStart
        ) {
          const separator = child.value?.indexOf('\n') ?? -1;
          if (separator < 0) return false;
          child.value = child.value!.slice(separator + 1);
          if (child.position) child.position.start = bodyPoint;
        }
        return true;
      });
      if (paragraph.children.length) {
        position.start = paragraph.children[0].position?.start ?? bodyPoint;
      } else quote.children!.shift();
      quote.data = {
        ...quote.data,
        hName: 'div',
        hProperties: {
          ...quote.data?.hProperties,
          className: `gfm-alert gfm-alert-type-${type}`,
          'data-alert-type': type,
        },
      };
    }
  };
}
