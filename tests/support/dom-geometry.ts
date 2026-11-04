// jsdom has no text layout. Real scrolling/geometry is exercised by test:desktop.
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects)
    Object.defineProperty(Range.prototype, 'getClientRects', {
      value: () => [],
    });
  if (!Range.prototype.getBoundingClientRect)
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      value: () => new DOMRect(),
    });
}
