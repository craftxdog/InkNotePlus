import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import electronChecksums from 'electron/checksums.json' with { type: 'json' };
import { macSigningConfiguration } from './config/distribution';
import metadata from './package.json' with { type: 'json' };
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = fileURLToPath(new URL('./assets/', import.meta.url));
const linuxIcon = path.join(assets, 'icons', '512x512.png');

// electron-installer-redhat supports post scripts; Forge's option type omits it.
const rpmOptions = {
  bin: metadata.productName,
  icon: linuxIcon,
  // The RPM maker's cp -r staging drops the helper's setuid bit.
  // Restore Chromium's required root ownership and mode after installation.
  post: `chown root:root /usr/lib/${metadata.name}/chrome-sandbox && chmod 4755 /usr/lib/${metadata.name}/chrome-sandbox`,
};

const config: ForgeConfig = {
  packagerConfig: {
    ...macSigningConfiguration(process.env),
    // Packager selects .icns on macOS and .ico on Windows.
    // https://www.electronforge.io/guides/create-and-add-icons
    icon: path.join(assets, 'icon'),
    asar: true,
    extraResource: ['resources/licenses', path.join(assets, 'icon.png')],
    download: {
      checksums: electronChecksums,
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: path.join(assets, 'icon.ico'),
      // Squirrel's default URL downloads Electron's icon. Installed branding is local.
      iconUrl: '',
    }),
    new MakerRpm({ options: rpmOptions }),
    new MakerDeb({ options: { bin: metadata.productName, icon: linuxIcon } }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
