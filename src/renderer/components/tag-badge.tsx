import type { CSSProperties } from 'react';
import type { TagColor } from '../../shared/tags';
import { useWorkspace } from '../state/workspace-context';

const colors = ['blue', 'green', 'red', 'purple', 'orange', 'teal'] as const;
export function tagColor(name: string): TagColor {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
export function tagColorStyle(color: TagColor): CSSProperties {
  return {
    '--tag-text': `light-dark(var(--tag-light-${color}-text-color), var(--tag-dark-${color}-text-color))`,
    '--tag-border': `light-dark(var(--tag-light-${color}-border-color), var(--tag-dark-${color}-border-color))`,
    '--tag-background': `light-dark(var(--tag-light-${color}-background-color), var(--tag-dark-${color}-background-color))`,
  } as CSSProperties;
}

export function TagBadge({ name, color }: { name: string; color?: TagColor }) {
  const saved = useWorkspace(
    ({ library }) => library.tagColors.find((tag) => tag.name === name)?.color,
  );
  const resolved = color ?? saved ?? tagColor(name);
  return (
    <span
      className={`tag-badge tag-color-${resolved}`}
      style={tagColorStyle(resolved)}
    >
      {name}
    </span>
  );
}
