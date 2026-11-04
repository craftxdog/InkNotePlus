import {
  themeManifestSchema,
  type ThemeManifest,
} from '../../shared/theme-manifest';

export interface ThemePackage {
  manifest: ThemeManifest;
  label: string;
  styles: string[];
  source: 'builtin' | 'installed';
}
const manifests = import.meta.glob('../../../themes/*/package.json', {
  eager: true,
  import: 'default',
});
const styles = import.meta.glob('../../../themes/*/styles/*.css', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});
export const themeCatalog: Record<string, ThemePackage> = Object.fromEntries(
  Object.entries(manifests).map(([file, raw]) => {
    const manifest = themeManifestSchema.parse(raw);
    const directory = file.slice(0, file.lastIndexOf('/'));
    return [
      manifest.name,
      {
        manifest,
        label: manifest.name
          .split('-')
          .map((word) =>
            word === 'inknote'
              ? 'InkNote'
              : word[0].toUpperCase() + word.slice(1),
          )
          .join(' '),
        styles: manifest.styleSheets.map(
          (sheet) => styles[`${directory}/styles/${sheet}`] as string,
        ),
        source: 'builtin',
      },
    ];
  }),
);
