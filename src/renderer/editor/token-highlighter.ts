import { tagHighlighter, tags } from '@lezer/highlight';

// Map Lezer tags onto the public .tok-* classes consumed by Inkdrop's syntax.css.
export const tokenHighlighter = tagHighlighter([
  { tag: tags.heading, class: 'tok-heading' },
  ...[
    tags.heading1,
    tags.heading2,
    tags.heading3,
    tags.heading4,
    tags.heading5,
    tags.heading6,
  ].map((tag, index) => ({
    tag,
    class: `tok-heading tok-heading-${index + 1}`,
  })),
  { tag: tags.strong, class: 'tok-strong' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.strikethrough, class: 'tok-strikethrough' },
  { tag: tags.link, class: 'tok-link' },
  { tag: tags.url, class: 'tok-url' },
  { tag: tags.monospace, class: 'tok-monospace md-inline-code' },
  { tag: tags.processingInstruction, class: 'tok-processing-instruction' },
  { tag: tags.meta, class: 'tok-meta' },
  { tag: tags.quote, class: 'tok-quote' },
  { tag: tags.list, class: 'tok-list' },
  { tag: tags.keyword, class: 'tok-keyword' },
  { tag: tags.string, class: 'tok-string' },
  { tag: tags.comment, class: 'tok-comment' },
  { tag: tags.number, class: 'tok-number' },
  { tag: tags.bool, class: 'tok-bool' },
  { tag: tags.null, class: 'tok-null' },
  { tag: tags.variableName, class: 'tok-variable-name' },
  { tag: tags.propertyName, class: 'tok-property-name' },
  { tag: tags.typeName, class: 'tok-class-name' },
  { tag: tags.operator, class: 'tok-operator' },
  { tag: tags.punctuation, class: 'tok-punctuation' },
  { tag: tags.invalid, class: 'tok-invalid' },
]);
