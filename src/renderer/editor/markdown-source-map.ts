interface SourceNode {
  type: string;
  children?: SourceNode[];
  checked?: boolean | null;
  position?: {
    start: { offset?: number; line: number; column: number };
    end: { offset?: number; line: number; column: number };
  };
  data?: {
    hProperties?: Record<string, string | number | boolean>;
    [key: string]: unknown;
  };
}
const blocks = new Set([
  'heading',
  'paragraph',
  'list',
  'listItem',
  'blockquote',
  'code',
  'table',
  'tableRow',
  'thematicBreak',
  'math',
  'image',
]);

// Use the parser's source positions. Text inside fenced code never becomes a task.
export function remarkSourceMap() {
  return (tree: SourceNode, file: { value: unknown }) => {
    const source = String(file.value);
    function visit(node: SourceNode) {
      const start = node.position?.start.offset,
        end = node.position?.end.offset;
      if (blocks.has(node.type) && start !== undefined && end !== undefined) {
        const properties: Record<string, string | number | boolean> = {
          ...node.data?.hProperties,
          'data-source-start': start,
          'data-source-end': end,
        };
        properties['data-source-line'] = node.position!.start.line;
        properties['data-source-column'] = node.position!.start.column;
        properties['data-source-end-line'] = node.position!.end.line;
        properties['data-source-end-column'] = node.position!.end.column;
        if (node.type === 'listItem' && typeof node.checked === 'boolean') {
          const paragraphStart = node.children?.[0]?.position?.start.offset;
          const paragraphMarker =
            paragraphStart === undefined
              ? null
              : /^\[([ xX])\](?=\s|$)/.exec(source.slice(paragraphStart, end));
          const marker = /^(?:[-+*]|\d+[.)])[\t ]+\[([ xX])\](?=\s|$)/.exec(
            source.slice(start, end),
          );
          if (paragraphMarker)
            properties['data-task-offset'] = paragraphStart! + 1;
          else if (marker)
            properties['data-task-offset'] =
              start + marker[0].lastIndexOf('[') + 1;
        }
        node.data = { ...node.data, hProperties: properties };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

export function updateTaskMarker(
  source: string,
  offset: number,
  checked: boolean,
): string | null {
  if (
    !Number.isInteger(offset) ||
    source[offset - 1] !== '[' ||
    source[offset + 1] !== ']' ||
    ![' ', 'x', 'X'].includes(source[offset])
  )
    return null;
  return (
    source.slice(0, offset) + (checked ? 'x' : ' ') + source.slice(offset + 1)
  );
}

export function minimalTextChange(previous: string, next: string) {
  let from = 0;
  while (
    from < previous.length &&
    from < next.length &&
    previous[from] === next[from]
  )
    from++;
  let oldEnd = previous.length,
    newEnd = next.length;
  while (
    oldEnd > from &&
    newEnd > from &&
    previous[oldEnd - 1] === next[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  return { from, to: oldEnd, insert: next.slice(from, newEnd) };
}
