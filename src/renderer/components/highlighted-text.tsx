import { Fragment } from 'react';
export function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  if (!terms.length) return text;
  const expression = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'giu',
  );
  return text
    .split(expression)
    .map((part, index) =>
      index % 2 ? (
        <mark key={index}>{part}</mark>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}
