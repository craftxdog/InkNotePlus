const number = /^\d+(?:\.\d+)?%?$/;
const value = (text: string) => Number.parseFloat(text);
const isPercent = (text: string) => text.endsWith('%');
const validAlpha = (text: string) =>
  number.test(text) && value(text) <= (isPercent(text) ? 100 : 1);

// Returns a normalized CSS color only for a complete, valid value. The result
// is rebuilt from checked numbers, so note text never reaches a style directly.
export function parseCssColor(text: string) {
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)) return text;
  const match = /^(rgb|hsl)a?\(\s*([^()]*?)\s*\)$/i.exec(text);
  if (!match) return null;
  const [first, second, third, alpha, extra] = match[2].split(/\s*,\s*|\s+/);
  if (
    third === undefined ||
    extra !== undefined ||
    ![first, second, third].every((part) => number.test(part)) ||
    (alpha !== undefined && !validAlpha(alpha))
  )
    return null;
  const suffix = alpha === undefined ? '' : ` / ${alpha}`;
  if (match[1].toLowerCase() === 'rgb') {
    const channels = [first, second, third];
    const percent = isPercent(first);
    if (
      channels.some(
        (part) =>
          isPercent(part) !== percent || value(part) > (percent ? 100 : 255),
      )
    )
      return null;
    return `rgb(${channels.join(' ')}${suffix})`;
  }
  if (
    isPercent(first) ||
    value(first) > 360 ||
    value(second) > 100 ||
    value(third) > 100
  )
    return null;
  return `hsl(${first} ${value(second)}% ${value(third)}%${suffix})`;
}
