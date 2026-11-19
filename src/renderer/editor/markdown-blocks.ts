export interface MarkdownBlock {
  text: string;
  /** 1-based source line of the block's first line. */
  line: number;
  /** Source offset of the block's first character. */
  offset: number;
}

// Reference and footnote definitions apply to the whole note.
const definition = /^ {0,3}\[[^\]\n]+\]:/m;
const fence = /^ {0,3}(`{3,}|~{3,})/;
const listMarker = /^(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;

/**
 * Splits Markdown into top-level blocks that parse the same on their own, so
 * the preview only parses the blocks that changed. A block starts at a
 * non-indented line after a blank line, outside fenced code and display math.
 * Loose lists stay in one block. Notes with definitions stay whole.
 */
export function splitMarkdownBlocks(source: string): MarkdownBlock[] {
  if (definition.test(source)) return [{ text: source, line: 1, offset: 0 }];
  const blocks: MarkdownBlock[] = [];
  let start = 0,
    startLine = 1,
    line = 1,
    offset = 0,
    blank = false,
    list = false,
    open: string | null = null,
    math = false;
  while (offset < source.length) {
    const newline = source.indexOf('\n', offset);
    const end = newline === -1 ? source.length : newline + 1;
    const text = source.slice(offset, end).replace(/\r?\n$/, '');
    if (open) {
      const close = fence.exec(text);
      if (
        close &&
        close[1][0] === open[0] &&
        close[1].length >= open.length &&
        !text.slice(close[0].length).trim()
      )
        open = null;
    } else if (math) {
      if (/^ {0,3}\$\$\s*$/.test(text)) math = false;
    } else if (!text.trim()) blank = true;
    else {
      const marker = listMarker.test(text);
      if (blank && !/^\s/.test(text) && !(list && marker) && offset > start) {
        blocks.push({
          text: source.slice(start, offset),
          line: startLine,
          offset: start,
        });
        start = offset;
        startLine = line;
        list = false;
      }
      if (marker && !/^\s/.test(text)) list = true;
      blank = false;
      const opening = fence.exec(text);
      if (opening) open = opening[1];
      else if (/^ {0,3}\$\$\s*$/.test(text)) math = true;
    }
    offset = end;
    line++;
  }
  if (start < source.length || !blocks.length)
    blocks.push({ text: source.slice(start), line: startLine, offset: start });
  return blocks;
}
