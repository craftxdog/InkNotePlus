import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  validateReleaseVersion,
  releaseAssets,
  stageInstallers,
  writeChecksums,
  validateUploadedAssets,
  assertDraftRelease,
  renderReleaseNotes,
} from '../../scripts/lib/release.mjs';

const metadata = { productName: 'InkNote', version: '1.0.0' };
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function directory() {
  const result = await mkdtemp(path.join(tmpdir(), 'inknote-release-test-'));
  directories.push(result);
  return result;
}
async function file(root: string, name: string, body = 'installer fixture') {
  const filename = path.join(root, name);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, body);
  return filename;
}

it('requires a semantic version matching the pushed tag and detects prereleases', () => {
  expect(validateReleaseVersion('1.0.0', 'v1.0.0')).toEqual({
    tag: 'v1.0.0',
    prerelease: false,
  });
  expect(validateReleaseVersion('1.2.0-beta.1').prerelease).toBe(true);
  expect(() => validateReleaseVersion('1.0.0', 'v1.0.1')).toThrow(/match/i);
  for (const version of [
    '01.0.0',
    '../1.0.0',
    '1.0',
    '1.0.0-01',
    '1.0.0-rc..1',
  ])
    expect(() => validateReleaseVersion(version)).toThrow(/version/i);
});

it('stages five distinct public downloads from the native maker outputs', async () => {
  const root = await directory();
  const make = path.join(root, 'make');
  const output = path.join(root, 'release');
  await file(make, 'dmg/arm64/InkNote-1.0.0-arm64.dmg', 'ARM');
  await file(make, 'dmg/x64/InkNote-1.0.0-x64.dmg', 'Intel');
  await file(make, 'squirrel.windows/x64/InkNote-1.0.0 Setup.exe', 'Windows');
  await file(make, 'squirrel.windows/x64/inknote-1.0.0-full.nupkg');
  await file(make, 'deb/x64/inknote_1.0.0_amd64.deb', 'Debian');
  await file(make, 'rpm/x64/inknote-1.0.0-1.x86_64.rpm', 'Fedora');
  for (const [platform, arch] of [
    ['darwin', 'arm64'],
    ['darwin', 'x64'],
    ['win32', 'x64'],
    ['linux', 'x64'],
  ])
    await stageInstallers(make, output, metadata, platform, arch);
  const manifest = await writeChecksums(output, metadata);
  expect(manifest.map((asset) => asset.name)).toEqual(
    releaseAssets(metadata)
      .map((asset) => asset.name)
      .sort(),
  );
  expect(
    await readFile(path.join(output, 'InkNote-1.0.0-macos-arm64.dmg'), 'utf8'),
  ).toBe('ARM');
  expect(
    await readFile(path.join(output, 'InkNote-1.0.0-macos-x64.dmg'), 'utf8'),
  ).toBe('Intel');
  const checksums = await readFile(path.join(output, 'SHA256SUMS'), 'utf8');
  expect(checksums).toContain(
    `${createHash('sha256').update('ARM').digest('hex')}  InkNote-1.0.0-macos-arm64.dmg\n`,
  );
  expect(checksums.trim().split('\n')).toHaveLength(5);
});

it('rejects unsupported targets, missing installers, ambiguous outputs and different versions', async () => {
  const root = await directory();
  await mkdir(path.join(root, 'make'));
  const output = path.join(root, 'release');
  await expect(
    stageInstallers(
      path.join(root, 'make'),
      output,
      metadata,
      'android',
      'arm64',
    ),
  ).rejects.toThrow(/target/i);
  await expect(
    stageInstallers(path.join(root, 'make'), output, metadata, 'win32', 'x64'),
  ).rejects.toThrow(/one installer/i);
  await file(root, 'make/windows/InkNote-1.0.1 Setup.exe');
  await expect(
    stageInstallers(path.join(root, 'make'), output, metadata, 'win32', 'x64'),
  ).rejects.toThrow(/version/i);
  await file(root, 'make/windows/InkNote-1.0.0 Setup.exe');
  await expect(
    stageInstallers(path.join(root, 'make'), output, metadata, 'win32', 'x64'),
  ).rejects.toThrow(/one installer/i);
});

it('refuses incomplete releases, unexpected files and empty downloads', async () => {
  const output = await directory();
  for (const asset of releaseAssets(metadata)) await file(output, asset.name);
  const first = releaseAssets(metadata)[0].name;
  await rm(path.join(output, first));
  await expect(writeChecksums(output, metadata)).rejects.toThrow(/assets/i);
  await file(output, first, '');
  await expect(writeChecksums(output, metadata)).rejects.toThrow(/empty/i);
  await file(output, first);
  await file(output, 'unreviewed.exe');
  await expect(writeChecksums(output, metadata)).rejects.toThrow(/assets/i);
});

it('only publishes a draft containing every uploaded file with its expected size and digest', () => {
  const local = [{ name: 'installer.dmg', size: 12, sha256: 'a'.repeat(64) }];
  const uploaded = [
    {
      name: 'installer.dmg',
      size: 12,
      state: 'uploaded',
      digest: `sha256:${'a'.repeat(64)}`,
    },
  ];
  expect(() => assertDraftRelease({ draft: false })).toThrow(/published/i);
  expect(() => assertDraftRelease({ draft: true })).not.toThrow();
  expect(() => validateUploadedAssets(local, uploaded)).not.toThrow();
  expect(() => validateUploadedAssets(local, [])).toThrow(/assets/i);
  expect(() =>
    validateUploadedAssets(local, [{ ...uploaded[0], size: 11 }]),
  ).toThrow(/upload/i);
  expect(() =>
    validateUploadedAssets(local, [
      { ...uploaded[0], digest: `sha256:${'b'.repeat(64)}` },
    ]),
  ).toThrow(/digest/i);
});

it('documents the real downloads and unsigned installation without advertising an Android APK', () => {
  const notes = renderReleaseNotes(metadata, 'craftxdog/InkNotePlus');
  for (const asset of releaseAssets(metadata))
    expect(notes).toContain(`/releases/download/v1.0.0/${asset.name}`);
  expect(notes).toContain('SHA256SUMS');
  expect(notes).toContain('notarización');
  expect(notes).not.toContain('.apk');
  expect(() => renderReleaseNotes(metadata, 'bad/repo/../../other')).toThrow(
    /repository/i,
  );
});

it('publishes only tagged builds after all native installer checks, with scoped write access', async () => {
  const workflow = parse(
    await readFile(
      new URL('../../.github/workflows/installers.yml', import.meta.url),
      'utf8',
    ),
  );
  expect(workflow.permissions.contents).toBe('read');
  expect(workflow.jobs.make.needs).toBe('version');
  expect(workflow.jobs.make.strategy.matrix.include).toHaveLength(4);
  expect(workflow.jobs.publish.needs).toBe('make');
  expect(workflow.jobs.publish.if).toBe(
    "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')",
  );
  expect(workflow.jobs.publish.permissions.contents).toBe('write');
  expect(workflow.concurrency['cancel-in-progress']).toBe(false);
});

it('refuses publication from a manual tag build before reading or uploading release assets', async () => {
  const packageMetadata = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  const result = spawnSync(
    process.execPath,
    ['scripts/release.mjs', 'publish'],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_REF: `refs/tags/v${packageMetadata.version}`,
        GITHUB_REF_NAME: `v${packageMetadata.version}`,
        GITHUB_REPOSITORY: 'craftxdog/InkNotePlus',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
      },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    'Public releases must run in the tested tag workflow',
  );
});
