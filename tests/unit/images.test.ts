import { describe, expect, it } from 'vitest';
import { inspectImage } from '../../src/main/image-store';
import { parseImageDimensions } from '../../src/renderer/editor/image-dimensions';
describe('managed image rendering', () => {
  it('supports Marp dimensions, aliases, units and clean alt captions', () => {
    expect(parseImageDimensions('photo width:50% h:120')).toEqual({
      caption: 'photo',
      width: '50%',
      height: '120px',
    });
    for (const unit of [
      'px',
      'pt',
      'pc',
      'in',
      'cm',
      'mm',
      'em',
      'ex',
      'ch',
      '%',
    ])
      expect(parseImageDimensions(`w:2.5${unit}`).width).toBe(`2.5${unit}`);
    expect(parseImageDimensions('caption w:expression(alert(1))')).toEqual({
      caption: 'caption w:expression(alert(1))',
    });
  });
  it('bounds dimensions before an image decoder runs', () => {
    const image = Buffer.alloc(32);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
    image.writeUInt32BE(640, 16);
    image.writeUInt32BE(480, 20);
    expect(inspectImage(image)).toEqual({
      extension: 'png',
      width: 640,
      height: 480,
    });
    image.writeUInt32BE(1_000_000, 16);
    expect(() => inspectImage(image)).toThrow();
    expect(() =>
      inspectImage(Buffer.from('<svg onload="alert(1)">')),
    ).toThrow();
  });
});
