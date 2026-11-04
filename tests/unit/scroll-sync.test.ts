import { expect, it } from 'vitest';
import { mapScroll } from '../../src/renderer/editor/scroll-sync';
it('maps unequal block heights in both directions rather than equating scroll percentages', () => {
  const anchors = [
    { editor: 0, preview: 0 },
    { editor: 100, preview: 300 },
    { editor: 400, preview: 600 },
  ];
  expect(mapScroll(anchors, 50, 'editor')).toBe(150);
  expect(mapScroll(anchors, 450, 'preview')).toBe(250);
  expect(mapScroll(anchors, 999, 'preview')).toBe(400);
  expect(mapScroll([], 10, 'editor')).toBe(0);
});
