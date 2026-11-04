import { describe, expect, it } from 'vitest';
import { render } from 'pele';
import { fixtures } from '../../src/renderer/vendor/inkdrop-mermaid/scripts/fixtures.mjs';
import { RENDER_OPTIONS } from '../../src/renderer/vendor/inkdrop-mermaid/src/render-options';

describe('Inkdrop Mermaid renderer contract', () => {
  it.each(Object.entries(fixtures))(
    'renders the official %s fixture',
    (_name, code) => {
      const result = render(code, RENDER_OPTIONS);
      expect(result.svg).toContain('<svg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.svg).not.toMatch(/href="(?:javascript:|inkdrop:)/);
    },
  );
  it('escapes untrusted labels, blocks remote images and filters unsafe links', () => {
    const result = render(
      'flowchart TD\nA["<img src=x onerror=alert(1)>"] --> B[Safe]\nclick B href "javascript:alert(1)"',
      RENDER_OPTIONS,
    );
    expect(result.svg).not.toContain('<img');
    expect(result.svg).not.toContain('href="javascript:');
    expect(result.svg).not.toContain('<script');
  });
});
