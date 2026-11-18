import { markdownLanguage } from '@codemirror/lang-markdown';

export interface OutlineItem {
  kind: 'heading' | 'task';
  level: number;
  text: string;
  line: number;
  checked?: boolean;
}

function plainText(markdown: string) {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, '$2')
    .replace(/(?<![\p{L}\p{N}])[*_](.+?)[*_](?![\p{L}\p{N}])/gu, '$1')
    .trim();
}

// The Lezer tree already excludes code blocks, so fenced examples stay out.
export function noteOutline(body: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let line = 1;
  let scanned = 0;
  const lineAt = (offset: number) => {
    for (
      let next = body.indexOf('\n', scanned);
      next !== -1 && next < offset;
      next = body.indexOf('\n', scanned)
    ) {
      line++;
      scanned = next + 1;
    }
    return line;
  };
  markdownLanguage.parser.parse(body).iterate({
    enter(node) {
      const atx = /^ATXHeading([1-6])$/.exec(node.name);
      const setext = /^SetextHeading([12])$/.exec(node.name);
      const source = body.slice(node.from, node.to);
      if (atx || setext) {
        const text = atx
          ? source.replace(/^#{1,6}[ \t]*/, '').replace(/[ \t]+#+[ \t]*$/, '')
          : source.split(/\r?\n/).slice(0, -1).join(' ');
        items.push({
          kind: 'heading',
          level: Number((atx ?? setext)![1]),
          text: plainText(text) || 'Sin título',
          line: lineAt(node.from),
        });
        return false;
      }
      if (node.name !== 'Task') return;
      const marker = node.node.getChild('TaskMarker');
      items.push({
        kind: 'task',
        level: 0,
        text:
          plainText(
            body.slice(marker?.to ?? node.from, node.to).split(/\r?\n/, 1)[0],
          ) || 'Sin título',
        line: lineAt(node.from),
        checked: !!marker && /x/i.test(body.slice(marker.from, marker.to)),
      });
      return false;
    },
  });
  return items;
}

export function activeOutlineIndex(
  items: readonly OutlineItem[],
  line: number,
) {
  return items.findLastIndex((item) => item.line <= line);
}
