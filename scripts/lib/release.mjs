import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function validateReleaseVersion(version, tag = '') {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(
      version,
    );
  if (
    !match ||
    match[4]
      ?.split('.')
      .some(
        (part) => !part || (/^\d+$/.test(part) && !/^(0|[1-9]\d*)$/.test(part)),
      )
  )
    throw new Error(
      'Expected a semantic release version such as 1.0.0 or 1.1.0-beta.1.',
    );
  if (tag && tag !== `v${version}`)
    throw new Error('The pushed tag must match package.json version.');
  return { tag: `v${version}`, prerelease: !!match[4] };
}

export function releaseAssets({ productName, version }) {
  validateReleaseVersion(version);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(productName))
    throw new Error('Unsafe product name.');
  const prefix = `${productName}-${version}`;
  return [
    {
      platform: 'darwin',
      arch: 'arm64',
      suffix: '-arm64.dmg',
      name: `${prefix}-macos-arm64.dmg`,
      label: 'macOS Apple Silicon',
    },
    {
      platform: 'darwin',
      arch: 'x64',
      suffix: '-x64.dmg',
      name: `${prefix}-macos-x64.dmg`,
      label: 'macOS Intel',
    },
    {
      platform: 'win32',
      arch: 'x64',
      suffix: 'setup.exe',
      name: `${prefix}-windows-x64-setup.exe`,
      label: 'Windows x64',
    },
    {
      platform: 'linux',
      arch: 'x64',
      suffix: '.deb',
      name: `${prefix}-linux-x64.deb`,
      label: 'Linux x64 (Debian / Ubuntu)',
    },
    {
      platform: 'linux',
      arch: 'x64',
      suffix: '.rpm',
      name: `${prefix}-linux-x64.rpm`,
      label: 'Linux x64 (Fedora / RPM)',
    },
  ];
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory()
        ? filesIn(filename)
        : entry.isFile()
          ? [filename]
          : [];
    }),
  );
  return nested.flat();
}

export async function stageInstallers(
  makeDirectory,
  output,
  metadata,
  platform,
  arch,
) {
  const targets = releaseAssets(metadata).filter(
    (asset) => asset.platform === platform && asset.arch === arch,
  );
  if (!targets.length) throw new Error('Unsupported release target.');
  const candidates = await filesIn(makeDirectory);
  await mkdir(output, { recursive: true });
  for (const target of targets) {
    const matches = candidates.filter((filename) =>
      path.basename(filename).toLowerCase().endsWith(target.suffix),
    );
    if (matches.length !== 1)
      throw new Error(
        `Expected exactly one installer for ${target.name}; found ${matches.length}.`,
      );
    // Makers include the source version in their native filenames. DEB uses ~ for prereleases.
    const version = metadata.version
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('-', '[-~]');
    if (
      !new RegExp(`(?:^|[^0-9A-Za-z])${version}(?=$|[^0-9A-Za-z.])`).test(
        path.basename(matches[0]),
      )
    )
      throw new Error(
        `Installer version does not match ${metadata.version}: ${matches[0]}`,
      );
    await copyFile(matches[0], path.join(output, target.name));
  }
}

export async function describeAsset(filename) {
  const info = await stat(filename);
  if (!info.isFile() || !info.size)
    throw new Error(`Empty or invalid release file: ${filename}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return {
    name: path.basename(filename),
    size: info.size,
    sha256: hash.digest('hex'),
  };
}

export async function writeChecksums(directory, metadata) {
  const expected = releaseAssets(metadata)
    .map((asset) => asset.name)
    .sort();
  const actual = (await readdir(directory))
    .filter((name) => name !== 'SHA256SUMS')
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      'Release assets must contain exactly all five supported installers.',
    );
  const assets = await Promise.all(
    expected.map((name) => describeAsset(path.join(directory, name))),
  );
  await writeFile(
    path.join(directory, 'SHA256SUMS'),
    assets.map((asset) => `${asset.sha256}  ${asset.name}\n`).join(''),
  );
  return assets;
}

export function assertDraftRelease(release) {
  if (release && !release.draft)
    throw new Error(
      'This version is already published. Create a new version instead of replacing public downloads.',
    );
}

export function validateUploadedAssets(local, uploaded) {
  if (
    uploaded.length !== local.length ||
    new Set(uploaded.map((asset) => asset.name)).size !== local.length
  )
    throw new Error('Uploaded release assets are incomplete or unexpected.');
  for (const expected of local) {
    const actual = uploaded.find((asset) => asset.name === expected.name);
    if (!actual || actual.state !== 'uploaded' || actual.size !== expected.size)
      throw new Error(`Incomplete upload: ${expected.name}`);
    if (actual.digest && actual.digest !== `sha256:${expected.sha256}`)
      throw new Error(`Uploaded digest mismatch: ${expected.name}`);
  }
}

export function renderReleaseNotes(metadata, repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error('Invalid GitHub repository.');
  const { tag } = validateReleaseVersion(metadata.version);
  const url = `https://github.com/${repository}/releases/download/${tag}`;
  const downloads = releaseAssets(metadata)
    .map(
      (asset) => `| ${asset.label} | [${asset.name}](${url}/${asset.name}) |`,
    )
    .join('\n');
  return `# ${metadata.productName} ${tag}

Descargas gratuitas para escritorio. Código bajo licencia MIT.

| Sistema | Instalador |
| --- | --- |
${downloads}

## Instalación

- **macOS:** abre el DMG y arrastra InkNote a Aplicaciones. Los DMG usan firma ad hoc, sin Developer ID ni notarización de Apple. macOS puede bloquear el primer inicio; si confías en esta descarga, sigue [las instrucciones oficiales de Apple para abrirla](https://support.apple.com/en-us/102445).
- **Windows:** ejecuta Setup. Este instalador no lleva un certificado Authenticode; Windows puede mostrar un aviso de editor desconocido o SmartScreen.
- **Linux:** instala el paquete DEB o RPM con el gestor de paquetes de tu distribución. Ambos son para x64.

## Integridad

Compara el SHA-256 del archivo descargado con [SHA256SUMS](${url}/SHA256SUMS).
En macOS puedes calcularlo con \`shasum -a 256 archivo.dmg\`, en Linux con \`sha256sum archivo.deb\` y en PowerShell con \`Get-FileHash archivo.exe -Algorithm SHA256\`.

La publicación se realiza después de instalar y probar los paquetes en runners nativos de macOS ARM, macOS Intel, Windows y Linux. Las pruebas usan perfiles temporales.

Android queda para una siguiente versión y requiere la adaptación móvil de la aplicación.
`;
}
