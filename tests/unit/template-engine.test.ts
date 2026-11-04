import { describe, expect, it } from 'vitest';
import {
  applyTemplate,
  readTemplate,
  renderTemplateValues,
  stripTemplateInstructions,
} from '../../src/renderer/templates/template-engine';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

describe('note templates', () => {
  it('renders documented dynamic values and preserves existing tags and status', () => {
    const template = {
      title: 'Daily',
      body: `---\n_template:\n  title: "{{ 'now' | date: '%Y-%m-%d' }}"\n  tags: [report]\n  status: active\n---\n\n> # !Instructions\n> Fill in the tasks.\n\n## Tasks\n\n- [ ] Do work\n`,
    };
    const result = applyTemplate(
      template,
      { ...defaultNoteMetadata, tags: ['work'], status: 'onhold' },
      [],
      new Date(2026, 10, 4),
    );
    expect(result.title).toBe('2026-11-04');
    expect(result.metadata).toMatchObject({
      tags: ['work', 'report'],
      status: 'onhold',
      isTemplate: false,
    });
    expect(result.body).toContain('- [ ] Do work');
    expect(result.body).not.toContain('Instructions');
    expect(result.body).not.toContain('_template');
    expect(
      renderTemplateValues('{% uuid %}', new Date(), () => 'unique-id'),
    ).toBe('unique-id');
  });
  it('keeps unrelated frontmatter and literal instruction examples inside fences', () => {
    const parsed = readTemplate(
      '---\n_template:\n  status: onHold\nexport: keep\n---\nText',
    );
    expect(parsed.body).toContain('export: keep');
    expect(parsed.body).not.toContain('_template');
    const body = '```md\n> # !Example\n> This is literal.\n```';
    expect(stripTemplateInstructions(body)).toBe(body);
    expect(() =>
      readTemplate('---\n_template: &x\n  tags: [*x]\n---\nText'),
    ).toThrow();
  });
  it('resolves local notebooks and refuses ambiguous or missing names', () => {
    const book = {
      id: '7782716a-273c-45c2-918b-bc14fc063cee',
      name: 'Work',
      parentId: null,
      count: 0,
      descendantCount: 0,
      icon: 'book-open' as const,
    };
    const template = {
      title: 'Test',
      body: '---\n_template:\n  notebook: Work\n  status: onHold\n---\nBody',
    };
    expect(
      applyTemplate(template, defaultNoteMetadata, [book]).metadata,
    ).toMatchObject({ notebookId: book.id, status: 'onhold' });
    expect(() => applyTemplate(template, defaultNoteMetadata, [])).toThrow();
    expect(() =>
      applyTemplate(template, defaultNoteMetadata, [
        book,
        { ...book, id: crypto.randomUUID() },
      ]),
    ).toThrow();
  });
});
