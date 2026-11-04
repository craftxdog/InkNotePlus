import { z } from '../../shared/validation';
import {
  registryInputSchema,
  type RegistryTheme,
  type ThemeRegistryInput,
} from '../../shared/themes';

const metadata = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().default(''),
  theme: z.union([z.boolean(), z.string()]).optional(),
});
const packageInfo = z.object({
  name: z.string(),
  downloads: z.number().default(0),
  metadata,
  releases: z.object({ latest: z.string() }),
});
const base = 'https://api.inkdrop.app/v2/packages';
export type FetchResource = (
  url: string,
  maxBytes: number,
) => Promise<Uint8Array>;

// The same v2 routes and version header used by inkdropapp/ipm's IPMRegistry.
export class ThemeRegistry {
  constructor(private readonly download: FetchResource) {}
  async browse(input: ThemeRegistryInput): Promise<RegistryTheme[]> {
    const { query, page, sort } = registryInputSchema.parse(input);
    const url = query
      ? `${base}/search?q=${encodeURIComponent(query)}`
      : `${base}/?theme=1&sort=${sort}&page=${page}`;
    const rows = z
      .array(packageInfo)
      .max(500)
      .parse(
        JSON.parse(
          new TextDecoder().decode(await this.download(url, 4_000_000)),
        ),
      );
    return rows
      .filter((row) => !!row.metadata.theme)
      .map((row) => ({
        name: row.name,
        version: row.releases.latest,
        description: row.metadata.description,
        downloads: row.downloads,
        compatible: row.metadata.theme === true,
      }));
  }
  async tarball(name: string): Promise<Uint8Array> {
    const info = packageInfo.parse(
      JSON.parse(
        new TextDecoder().decode(
          await this.download(`${base}/${name}`, 4_000_000),
        ),
      ),
    );
    if (info.metadata.theme !== true) throw new Error('incompatible');
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(info.releases.latest))
      throw new Error('invalid_package');
    return this.download(
      `${base}/${name}/versions/${info.releases.latest}/tarball`,
      20_000_000,
    );
  }
}
