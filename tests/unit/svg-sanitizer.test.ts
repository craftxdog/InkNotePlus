import { describe, expect, it } from 'vitest';
import { sanitizeSvg, svgDimensions } from '../../src/main/svg-sanitizer';

const clean = (svg: string) => sanitizeSvg(Buffer.from(svg)).toString('utf8');

describe('SVG sanitizing', () => {
  it('keeps drawing content and internal references', () => {
    const output = clean(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="5" height="5"/><use href="#g"/><text>Hola &amp; adiós</text></svg>',
    );
    expect(output).toContain('fill="url(#g)"');
    expect(output).toContain('<use href="#g"');
    expect(output).toContain('Hola &amp; adiós');
    expect(output.startsWith('<svg')).toBe(true);
  });
  it.each([
    ['scripts', '<svg><script>alert(1)</script></svg>', /alert|script/],
    [
      'event handlers',
      '<svg onload="alert(1)"><rect onclick="x()"/></svg>',
      /onload|onclick|alert/,
    ],
    [
      'embedded HTML',
      '<svg><foreignObject><iframe src="https://x.test"/></foreignObject></svg>',
      /foreignObject|iframe|x\.test/i,
    ],
    [
      'style sheets',
      '<svg><style>@import "https://x.test/a.css";</style></svg>',
      /style|x\.test/,
    ],
    [
      'animated links',
      '<svg><a><animate attributeName="href" to="javascript:alert(1)"/></a></svg>',
      /animate|javascript/,
    ],
    [
      'external images',
      '<svg><image href="https://x.test/a.png"/></svg>',
      /x\.test/,
    ],
    [
      'external references',
      '<svg><use xlink:href="https://x.test/a.svg#b"/></svg>',
      /x\.test/,
    ],
    [
      'script links',
      '<svg><a href="javascript:alert(1)"><rect/></a></svg>',
      /javascript/,
    ],
    [
      'remote paint',
      '<svg><rect fill="url(https://x.test/a)"/></svg>',
      /x\.test/,
    ],
    [
      'remote styles',
      '<svg><rect style="fill:url(https://x.test/a)"/></svg>',
      /x\.test/,
    ],
  ])('removes %s', (_name, svg, forbidden) => {
    expect(clean(svg)).not.toMatch(forbidden);
  });
  it('keeps embedded raster images', () => {
    expect(
      clean('<svg><image href="data:image/png;base64,AAAA"/></svg>'),
    ).toContain('data:image/png;base64,AAAA');
  });
  it.each([
    ['documents that are not SVG', '<html><svg/></html>'],
    ['malformed XML', '<svg><rect></svg>'],
    ['custom entities', '<!DOCTYPE svg [<!ENTITY a "b">]><svg>&a;</svg>'],
  ])('rejects %s', (_name, svg) => {
    expect(() => clean(svg)).toThrow();
  });
});

describe('SVG dimensions', () => {
  const size = (svg: string) => svgDimensions(Buffer.from(svg));
  it('reads explicit sizes, then the view box, then the CSS default', () => {
    expect(size('<svg width="20px" height="10"/>')).toEqual({
      width: 20,
      height: 10,
    });
    expect(size('<svg width="100%" viewBox="0 0 64 48"/>')).toEqual({
      width: 64,
      height: 48,
    });
    expect(size('<svg/>')).toEqual({ width: 300, height: 150 });
  });
});
