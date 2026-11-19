import { describe, expect, it } from 'vitest';
import { builtinTemplates } from '../../src/renderer/templates/builtin-templates';
import {
  applyTemplate,
  readTemplate,
} from '../../src/renderer/templates/template-engine';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

const book = (id: string, name: string) => ({
  id,
  name,
  parentId: null,
  count: 0,
  descendantCount: 0,
  icon: 'book-open' as const,
});

describe('built-in templates', () => {
  it('covers every category with at least two templates', () => {
    for (const category of [
      'Lluvia de ideas',
      'Depuración',
      'Aprendizaje',
      'Planificación',
      'Productividad',
    ])
      expect(
        builtinTemplates.filter((item) => item.category === category).length,
      ).toBeGreaterThanOrEqual(2);
  });

  it.each(builtinTemplates.map((item) => [item.id, item] as const))(
    '%s has a description and applies cleanly',
    (_id, template) => {
      expect(readTemplate(template.body).config.description).toBeTruthy();
      const applied = applyTemplate(
        { title: template.title, body: template.body },
        defaultNoteMetadata,
        [],
      );
      expect(applied.title).not.toContain('{{');
      expect(applied.body).not.toContain('_template');
    },
  );

  it('uses unique ids', () => {
    const ids = builtinTemplates.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('template references', () => {
  const body = (line: string) => `---\n_template:\n  ${line}\n---\nTexto\n`;

  it('resolves book:ID to the notebook', () => {
    const applied = applyTemplate(
      {
        title: 'T',
        body: body('notebook: "book:7f1c2c52-6c0e-4a55-9f39-1c1b6f7a2d10"'),
      },
      defaultNoteMetadata,
      [book('7f1c2c52-6c0e-4a55-9f39-1c1b6f7a2d10', 'Trabajo')],
    );
    expect(applied.metadata.notebookId).toBe(
      '7f1c2c52-6c0e-4a55-9f39-1c1b6f7a2d10',
    );
  });

  it('resolves tag:ID to an existing tag name', () => {
    const applied = applyTemplate(
      { title: 'T', body: body('tags: ["tag:Informe", "libre"]') },
      defaultNoteMetadata,
      [],
      new Date(),
      [{ name: 'informe' }],
    );
    expect(applied.metadata.tags).toEqual(['informe', 'libre']);
  });

  it('drops a tag:ID that does not exist instead of creating it', () => {
    const applied = applyTemplate(
      { title: 'T', body: body('tags: ["tag:perdida"]') },
      defaultNoteMetadata,
      [],
    );
    expect(applied.metadata.tags).toEqual([]);
  });
});
