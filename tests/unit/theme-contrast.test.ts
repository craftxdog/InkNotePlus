import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  readableColor,
} from '../../src/renderer/themes/theme-contrast';

describe('theme text contrast', () => {
  it('preserves colors that are already readable', () => {
    expect(readableColor([0, 0, 0, 1], [[255, 255, 255]])).toBeNull();
    expect(readableColor([210, 210, 210, 1], [[24, 24, 32]])).toBeNull();
  });
  it('makes translucent sidebar labels readable against selected backgrounds', () => {
    const backgrounds = [
      [231, 229, 228],
      [206, 215, 231],
    ] as const;
    const result = readableColor([0, 0, 0, 0.4], backgrounds)!;
    for (const background of backgrounds)
      expect(contrastRatio(result, background)).toBeGreaterThanOrEqual(4.5);
    expect(result[0]).toBeGreaterThanOrEqual(result[1]);
    expect(result[1]).toBeGreaterThanOrEqual(result[2]);
  });
  it('retains the relative channels of low-contrast Solarized syntax', () => {
    const backgrounds = [
      [253, 246, 226],
      [220, 222, 202],
    ] as const;
    const result = readableColor([133, 153, 0, 1], backgrounds)!;
    for (const background of backgrounds)
      expect(contrastRatio(result, background)).toBeGreaterThanOrEqual(4.5);
    expect(result[1]).toBeGreaterThan(result[0]);
    expect(result[2]).toBe(0);
  });
  it('lightens dark theme text while retaining its original hue', () => {
    const background = [20, 65, 85] as const;
    const result = readableColor([91, 96, 190, 1], [background])!;
    expect(contrastRatio(result, background)).toBeGreaterThanOrEqual(4.5);
    expect(result[2]).toBeGreaterThan(result[1]);
    expect(result[1]).toBeGreaterThan(result[0]);
  });
});
