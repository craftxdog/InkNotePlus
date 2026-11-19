import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { portableName, portableTargets } from '../../scripts/lib/portable.mjs';

describe('portable builds', () => {
  it('names each archive after its platform', () => {
    expect(portableName('1.4.0', 'darwin', 'arm64')).toBe(
      'InkNote-1.4.0-macos-arm64.zip',
    );
    expect(portableName('1.4.0', 'win32', 'arm64')).toBe(
      'InkNote-1.4.0-windows-arm64.zip',
    );
    expect(portableName('1.4.0', 'linux', 'x64')).toBe(
      'InkNote-1.4.0-linux-x64.zip',
    );
  });

  it('covers the ARM64 systems without an installer', () => {
    expect(portableTargets).toContainEqual({
      platform: 'win32',
      arch: 'arm64',
    });
    expect(portableTargets).toContainEqual({
      platform: 'linux',
      arch: 'arm64',
    });
  });

  it('rejects an unknown target', () => {
    expect(() => portableName('1.0.0', 'freebsd', 'x64')).toThrow();
  });

  it('stays out of the required installer builds', () => {
    const forge = readFileSync('forge.config.mts', 'utf8');
    expect(forge).toContain('process.env.INKNOTE_PORTABLE');
    const installers = readFileSync('.github/workflows/installers.yml', 'utf8');
    expect(installers).not.toContain('INKNOTE_PORTABLE');
  });

  it('builds every target in the portable workflow', () => {
    const workflow = readFileSync('.github/workflows/portable.yml', 'utf8');
    for (const { platform, arch } of portableTargets)
      expect(workflow).toContain(`make-portable.mjs ${platform} ${arch}`);
  });
});
