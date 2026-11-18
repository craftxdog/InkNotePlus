import { describe, expect, it } from 'vitest';
import { parseCssColor } from '../../src/renderer/editor/css-color';

describe('color values in inline code', () => {
  it.each([
    ['#fff', '#fff'],
    ['#FFAA00', '#FFAA00'],
    ['#ffaa0080', '#ffaa0080'],
    ['#abcd', '#abcd'],
    ['rgb(255,0,10)', 'rgb(255 0 10)'],
    ['rgb(255, 0, 10)', 'rgb(255 0 10)'],
    ['rgba(1, 2, 3, 0.5)', 'rgb(1 2 3 / 0.5)'],
    ['rgb(100%, 0%, 50%)', 'rgb(100% 0% 50%)'],
    ['hsl(210,50,40)', 'hsl(210 50% 40%)'],
    ['hsl(210, 50%, 40%)', 'hsl(210 50% 40%)'],
    ['hsla(210, 50%, 40%, 25%)', 'hsl(210 50% 40% / 25%)'],
    ['HSL(360, 100%, 0%)', 'hsl(360 100% 0%)'],
  ])('recognizes %s', (text, color) => {
    expect(parseCssColor(text)).toBe(color);
  });
  it.each([
    ' #fff',
    '#fff ',
    '#ff',
    '#fffff',
    '#ggg',
    'rgb(256, 0, 0)',
    'rgb(1, 2)',
    'rgb(1, 2, 3, 4)',
    'rgb(101%, 0%, 0%)',
    'hsl(361, 50%, 50%)',
    'hsl(10, 101%, 50%)',
    'red',
    'url(https://example.com/x.png)',
    'rgb(1, 2, 3); background: url(x)',
    'color: #fff',
  ])('ignores %j', (text) => {
    expect(parseCssColor(text)).toBeNull();
  });
});
