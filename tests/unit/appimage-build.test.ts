import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  appImageName,
  appImageTools,
  appRunScript,
  desktopEntry,
} from '../../scripts/lib/appimage.mjs';

describe('AppImage builds', () => {
  it('names the AppImage like the portable archives', () => {
    expect(appImageName('1.6.2', 'x64')).toBe(
      'InkNote-1.6.2-linux-x64.AppImage',
    );
    expect(appImageName('1.6.2', 'arm64')).toBe(
      'InkNote-1.6.2-linux-arm64.AppImage',
    );
    expect(() => appImageName('1.6.2', 'ia32')).toThrow();
  });

  it('downloads pinned tool releases verified by SHA-256', () => {
    for (const arch of ['x64', 'arm64'] as const) {
      const tools = appImageTools[arch];
      for (const tool of [tools.appimagetool, tools.runtime]) {
        expect(tool.url).toMatch(
          /^https:\/\/github\.com\/AppImage\/[\w-]+\/releases\/download\/[\w.]+\//,
        );
        expect(tool.url).not.toContain('continuous');
        expect(tool.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('registers the app and its inknote:// links with the desktop', () => {
    const entry = desktopEntry();
    expect(entry).toMatch(/^\[Desktop Entry\]\n/);
    expect(entry).toContain('Name=InkNote\n');
    expect(entry).toContain('Exec=InkNote %U\n');
    expect(entry).toContain('Icon=inknote\n');
    expect(entry).toContain('MimeType=x-scheme-handler/inknote;\n');
  });

  it('starts the app and only drops the sandbox where the system blocks it', () => {
    const script = appRunScript();
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain('apparmor_restrict_unprivileged_userns');
    expect(script).toContain('--no-sandbox');
    expect(script).toContain('exec "$here/usr/lib/inknote/InkNote" "$@"');
  });

  it('builds both architectures in the portable workflow', () => {
    const workflow = readFileSync('.github/workflows/portable.yml', 'utf8');
    expect(workflow).toContain('make-appimage.mjs x64');
    expect(workflow).toContain('make-appimage.mjs arm64');
  });
});
