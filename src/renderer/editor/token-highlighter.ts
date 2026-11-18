import { Tag, tagHighlighter, tags } from '@lezer/highlight';

// Lezer supplies the semantics; Inkdrop's public syntax.css supplies the colors.
// Adapt its kebab-case class vocabulary instead of maintaining a language map.
function tokenClass(name: string) {
  if (name === 'typeName') return 'tok-class-name';
  if (name === 'docString') return 'tok-string';
  if (name === 'escape') return 'tok-string tok-special';
  if (name === 'monospace') return 'tok-monospace md-inline-code';
  if (/^heading[1-6]$/.test(name))
    return `tok-heading tok-heading-${name.at(-1)}`;
  return `tok-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

const modifiers = [
  ['constant', tags.constant],
  ['standard', tags.standard],
  ['definition', tags.definition],
  ['function', tags.function],
  ['special', tags.special],
  ['local', tags.local],
] as const;

// Include combinations: a declared function is both a function and a definition.
function modifiedTokens(name: string, tag: Tag) {
  const rules = [{ tag, class: tokenClass(name) }];
  for (const [modifier, apply] of modifiers) {
    rules.push(
      ...rules.map((rule) => ({
        tag: apply(rule.tag),
        class: `${rule.class} tok-${modifier}`,
      })),
    );
  }
  return rules;
}

export const tokenHighlighter = tagHighlighter([
  ...Object.entries(tags).flatMap(([name, tag]) =>
    tag instanceof Tag ? [{ tag, class: tokenClass(name) }] : [],
  ),
  ...(['name', 'variableName', 'propertyName', 'string'] as const).flatMap(
    (name) => modifiedTokens(name, tags[name]),
  ),
]);
