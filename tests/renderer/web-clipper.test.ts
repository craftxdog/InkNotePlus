// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { extractPage } from '../../extensions/web-clipper/clipper.js';

afterEach(() => {
  document.body.innerHTML = '';
  getSelection()?.removeAllRanges();
});

function page(html: string) {
  document.title = 'Página';
  document.body.innerHTML = html;
}

describe('Web Clipper extraction', () => {
  it('keeps the article and drops navigation, scripts and forms', () => {
    page(
      '<nav>Menú</nav><article><p>Texto</p><script>robar()</script><form><input></form></article><footer>Pie</footer>',
    );
    const { html, title, url } = extractPage('page');
    expect(html).toContain('<p>Texto</p>');
    expect(html).not.toMatch(/Menú|robar|<form|Pie/);
    expect(title).toBe('Página');
    expect(url).toBe(location.href);
  });

  it('makes links and images absolute', () => {
    page(
      '<main><a href="/otra">a</a><img src="foto.png" srcset="x 2x"></main>',
    );
    const { html } = extractPage('page');
    expect(html).toContain(`href="${new URL('/otra', location.href).href}"`);
    expect(html).toContain(`src="${new URL('foto.png', location.href).href}"`);
    expect(html).not.toContain('srcset');
  });

  it('saves only the selection when asked', () => {
    page('<article><p>Uno</p><p id="dos">Dos</p></article>');
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('dos')!);
    getSelection()!.addRange(range);
    expect(extractPage('selection').html).toBe('Dos');
  });

  it('falls back to the whole page without a selection', () => {
    page('<article><p>Uno</p></article>');
    expect(extractPage('selection').html).toContain('Uno');
  });
});
