const colors = ['blue', 'green', 'red', 'purple', 'orange', 'teal'] as const;
export function tagColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
export function TagBadge({ name }: { name: string }) {
  return (
    <span className={`tag-badge tag-color-${tagColor(name)}`}>{name}</span>
  );
}
