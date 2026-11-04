import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildMathStylesheet } from '../src/renderer/vendor/inkdrop-math/scripts/katex-css.mjs';

const require = createRequire(import.meta.url);
const source = readFileSync(require.resolve('katex/dist/katex.css'), 'utf8');
writeFileSync(
  new URL(
    '../src/renderer/vendor/inkdrop-math/styles/katex.css',
    import.meta.url,
  ),
  buildMathStylesheet(source, { fontUrlPrefix: 'katex/dist/fonts' }),
);
