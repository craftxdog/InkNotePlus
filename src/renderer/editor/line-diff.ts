export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

// Beyond this many comparisons a rewrite is shown as replaced, not aligned.
const maximumCells = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split('\n');
  const right = after.split('\n');
  let start = 0;
  while (
    start < left.length &&
    start < right.length &&
    left[start] === right[start]
  )
    start++;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (
    leftEnd > start &&
    rightEnd > start &&
    left[leftEnd - 1] === right[rightEnd - 1]
  ) {
    leftEnd--;
    rightEnd--;
  }
  const same = (text: string): DiffLine => ({ type: 'same', text });
  const removed = (text: string): DiffLine => ({ type: 'removed', text });
  const added = (text: string): DiffLine => ({ type: 'added', text });
  const oldLines = left.slice(start, leftEnd);
  const newLines = right.slice(start, rightEnd);
  const rows = oldLines.length + 1;
  const columns = newLines.length + 1;
  const middle: DiffLine[] = [];
  if (rows * columns > maximumCells) {
    middle.push(...oldLines.map(removed), ...newLines.map(added));
  } else {
    // Longest common subsequence, filled from the end to walk forward below.
    const table = new Uint32Array(rows * columns);
    for (let row = rows - 2; row >= 0; row--)
      for (let column = columns - 2; column >= 0; column--)
        table[row * columns + column] =
          oldLines[row] === newLines[column]
            ? table[(row + 1) * columns + column + 1] + 1
            : Math.max(
                table[(row + 1) * columns + column],
                table[row * columns + column + 1],
              );
    let row = 0;
    let column = 0;
    while (row < oldLines.length || column < newLines.length) {
      if (
        row < oldLines.length &&
        column < newLines.length &&
        oldLines[row] === newLines[column]
      ) {
        middle.push(same(oldLines[row]));
        row++;
        column++;
      } else if (
        column === newLines.length ||
        (row < oldLines.length &&
          table[(row + 1) * columns + column] >=
            table[row * columns + column + 1])
      )
        middle.push(removed(oldLines[row++]));
      else middle.push(added(newLines[column++]));
    }
  }
  return [
    ...left.slice(0, start).map(same),
    ...middle,
    ...left.slice(leftEnd).map(same),
  ];
}
