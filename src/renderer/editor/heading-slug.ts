// GitHub's heading ids: lowercase, punctuation removed, spaces as hyphens,
// and `-1`, `-2`… for repeated headings.
// https://github.com/Flet/github-slugger
export function headingSlug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replaceAll(' ', '-');
}

// Finds the heading an in-note `#id` link points to. Ids are resolved on click
// because each preview block renders on its own and cannot count repeats.
export function findHeading(container: ParentNode, id: string) {
  let target = id;
  try {
    target = decodeURIComponent(id);
  } catch {
    // Keep a malformed escape as written.
  }
  target = target.toLowerCase();
  const seen = new Map<string, number>();
  for (const heading of container.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, h5, h6',
  )) {
    const base = headingSlug(heading.textContent ?? '');
    let slug = base;
    let count = seen.get(base) ?? 0;
    while (seen.has(slug)) slug = `${base}-${++count}`;
    seen.set(base, count);
    seen.set(slug, 0);
    if (slug === target) return heading;
  }
  return null;
}
