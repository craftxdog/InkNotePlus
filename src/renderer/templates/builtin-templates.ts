// Published example from Inkdrop's template guide; no private template library
// is copied or inferred. Users can create additional templates in the sidebar.
export const builtinTemplates = [
  {
    id: 'builtin:daily-report',
    title: 'Daily Report',
    category: 'Productivity',
    source: 'https://docs.inkdrop.app/reference/note-templates',
    body: `---
_template:
  title: "{{ 'now' | date: '%Y-%m-%d' }} - Daily Report"
  description: What I did today, what I plan for tomorrow, and any blockers.
  tags:
    - report
  status: active
---

## What I worked on

1.

## Blockers

1.
`,
  },
] as const;
