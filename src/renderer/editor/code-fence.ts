import type { SourceNode } from './markdown-source-map';

export interface CodeFenceMeta {
  title?: string;
  filename?: string;
  line?: number;
  commit?: string;
  url?: string;
}

// Inkdrop's documented attributes are plain metadata, never HTML or code.
// https://docs.inkdrop.app/reference/agent-skills
export function parseCodeFenceMeta(meta = ''): CodeFenceMeta {
  const result: CodeFenceMeta = {};
  const attributes =
    /(?:^|\s)(title|filename|line|commit|url)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s"']+))/g;
  for (const match of meta.matchAll(attributes)) {
    const key = match[1] as keyof CodeFenceMeta;
    const value = (match[2] ?? match[3] ?? match[4]).replace(
      /\\([\\"'])/g,
      '$1',
    );
    if (key === 'line') {
      const line = Number(value);
      if (/^\d+$/.test(value) && Number.isSafeInteger(line) && line > 0)
        result.line = line;
    } else if (key === 'url') {
      try {
        const url = new URL(value);
        if (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        )
          result.url = value;
      } catch {
        // Malformed and non-web links remain inert.
      }
    } else if (value) result[key] = value;
  }
  return result;
}

// mdast keeps the info string's attributes in `meta`; preserve it when remark
// converts the fenced code node into HAST, alongside the existing source map.
export function remarkCodeFenceMeta() {
  return (tree: SourceNode & { meta?: string | null }) => {
    function visit(node: SourceNode & { meta?: string | null }) {
      if (node.type === 'code' && node.meta)
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            'data-code-meta': node.meta,
          },
        };
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
