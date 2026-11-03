import lightManifest from '../../../themes/inknote-light/package.json';
import darkManifest from '../../../themes/inknote-dark/package.json';
import lightUi from '../../../themes/inknote-light/styles/ui.css?url&no-inline';
import lightSyntax from '../../../themes/inknote-light/styles/syntax.css?url&no-inline';
import lightPreview from '../../../themes/inknote-light/styles/preview.css?url&no-inline';
import darkUi from '../../../themes/inknote-dark/styles/ui.css?url&no-inline';
import darkSyntax from '../../../themes/inknote-dark/styles/syntax.css?url&no-inline';
import darkPreview from '../../../themes/inknote-dark/styles/preview.css?url&no-inline';
import { themeManifestSchema } from '../../shared/theme-manifest';
import type { ThemeId } from '../../shared/preferences';

export const themeCatalog = {
  'inknote-light': {
    manifest: themeManifestSchema.parse(lightManifest),
    label: 'InkNote Light',
    assets: {
      'ui.css': lightUi,
      'syntax.css': lightSyntax,
      'preview.css': lightPreview,
    },
  },
  'inknote-dark': {
    manifest: themeManifestSchema.parse(darkManifest),
    label: 'InkNote Dark',
    assets: {
      'ui.css': darkUi,
      'syntax.css': darkSyntax,
      'preview.css': darkPreview,
    },
  },
} satisfies Record<ThemeId, unknown>;
