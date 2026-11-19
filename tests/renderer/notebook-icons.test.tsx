// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { NotebookIcon } from '../../src/renderer/components/notebook-icon';
import { filterIconNames } from '../../src/renderer/components/notebook-icon-search';
import { notebookIconSchema } from '../../src/shared/notebook-icons';

describe('notebook icon catalog', () => {
  it.each(['book-open', 'flask', 'alarm-clock', 'a-arrow-down', 'grid-2x2'])(
    'accepts %s',
    (name) => expect(notebookIconSchema.safeParse(name).success).toBe(true),
  );

  it.each(['', 'Bad', '../x', 'a b', 'a--b', `${'a'.repeat(65)}`])(
    'rejects %j',
    (name) => expect(notebookIconSchema.safeParse(name).success).toBe(false),
  );

  it('renders a stored icon that is not in the catalog', () => {
    const { container } = render(<NotebookIcon name="icono-desconocido" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('searches names and limits the result', () => {
    const names = ['alarm-clock', 'clock', 'book', ...Array(300).fill('zeta')];
    expect(filterIconNames(names, 'CLOCK')).toEqual(['alarm-clock', 'clock']);
    expect(filterIconNames(names, '')).toHaveLength(120);
  });
});
