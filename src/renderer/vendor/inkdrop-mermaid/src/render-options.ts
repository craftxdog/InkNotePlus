import type { MountOptions } from 'pele';

/**
 * Options every diagram renders with. scripts/check-styles.mjs imports these
 * too, so the check renders the configuration that ships.
 *
 * - `linkSchemes`: Pele drops other schemes from the SVG. This host opens
 *   only HTTP(S) links through its validated IPC bridge.
 * - `autoDirection: false`: keep a diagram's declared direction in a narrow
 *   container. Pele would turn an `LR` flowchart into a vertical stack, which
 *   Mermaid never did; the SVG scales down to fit instead.
 */
export const RENDER_OPTIONS = {
  linkSchemes: ['http', 'https'],
  autoDirection: false,
  images: false,
} satisfies MountOptions;
