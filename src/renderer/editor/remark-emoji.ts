import { nameToEmoji } from 'gemoji';

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

const shortcode = /:([a-z0-9_+-]+):/g;

function replaceCodes(node: MarkdownNode) {
  // Code is stored in other node types, so only prose reaches this branch.
  if (node.type === 'text' && node.value?.includes(':'))
    node.value = node.value.replace(shortcode, (code, name: string) =>
      Object.hasOwn(nameToEmoji, name) ? nameToEmoji[name] : code,
    );
  node.children?.forEach(replaceCodes);
}

export const remarkEmoji = () => replaceCodes;
