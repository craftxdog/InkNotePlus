const maxVisibleIcons = 120;

export const filterIconNames = (names: readonly string[], query: string) => {
  const term = query.trim().toLocaleLowerCase();
  return names.filter((name) => name.includes(term)).slice(0, maxVisibleIcons);
};
