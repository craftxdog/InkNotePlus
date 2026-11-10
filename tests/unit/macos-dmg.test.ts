import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyMacDmgImage } from '../../scripts/lib/macos-dmg.mjs';

const { spawnSync, setTimeout } = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:child_process', () => ({ spawnSync }));
vi.mock('node:timers/promises', () => ({ setTimeout }));

const unavailable = {
  status: 1,
  stderr: 'hdiutil: verify failed - Resource temporarily unavailable',
};

describe('macOS disk image verification', () => {
  beforeEach(() => {
    spawnSync.mockReset();
    setTimeout.mockClear();
  });

  it('retries when the disk image is temporarily unavailable', async () => {
    spawnSync
      .mockReturnValueOnce(unavailable)
      .mockReturnValueOnce({ status: 0 });

    await verifyMacDmgImage('InkNote.dmg', '/build');

    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenLastCalledWith(
      '/usr/bin/hdiutil',
      ['verify', 'InkNote.dmg'],
      expect.objectContaining({ cwd: '/build' }),
    );
    expect(setTimeout).toHaveBeenCalledTimes(1);
  });

  it('fails immediately when the image fails its checksum', async () => {
    spawnSync.mockReturnValue({ status: 1, stderr: 'checksum failed' });

    await expect(verifyMacDmgImage('InkNote.dmg', '/build')).rejects.toThrow(
      'checksum failed',
    );

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it('fails after three attempts if the disk image stays unavailable', async () => {
    spawnSync.mockReturnValue(unavailable);

    await expect(verifyMacDmgImage('InkNote.dmg', '/build')).rejects.toThrow(
      'Resource temporarily unavailable',
    );

    expect(spawnSync).toHaveBeenCalledTimes(3);
    expect(setTimeout).toHaveBeenCalledTimes(2);
  });
});
