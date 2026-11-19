import { expect, it } from 'vitest';
import {
  mapScroll,
  referenceOffset,
} from '../../src/renderer/editor/scroll-sync';
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

it('slides the reading row to each edge so both pane ends meet', () => {
  const pane = (scrollTop: number) =>
    ({ clientHeight: 100, scrollHeight: 1000, scrollTop }) as HTMLElement;
  expect(referenceOffset(pane(0))).toBe(0);
  expect(referenceOffset(pane(20))).toBe(20);
  expect(referenceOffset(pane(500))).toBe(35);
  expect(referenceOffset(pane(835))).toBe(35);
  expect(referenceOffset(pane(870))).toBe(70);
  expect(referenceOffset(pane(900))).toBe(100);
});
