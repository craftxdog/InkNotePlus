const platformNames = { darwin: 'macos', win32: 'windows', linux: 'linux' };

export const portableTargets = [
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'darwin', arch: 'x64' },
  { platform: 'win32', arch: 'x64' },
  { platform: 'win32', arch: 'arm64' },
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
];

export function portableName(version, platform, arch) {
  if (
    !portableTargets.some(
      (item) => item.platform === platform && item.arch === arch,
    )
  )
    throw new Error(`Unsupported portable target: ${platform} ${arch}`);
  return `InkNote-${version}-${platformNames[platform]}-${arch}.zip`;
}
