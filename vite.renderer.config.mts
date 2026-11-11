import { defineConfig } from 'vite';

// Vite transforms TSX natively. React Fast Refresh would require an inline
// preamble, so component changes use full reload under script-src 'self'.
export default defineConfig({
  build: {
    assetsInlineLimit: 0,
    // Electron 45.1 ships Chromium 156. Keep light-dark() native: the legacy
    // CSS fallback follows OS media queries, not the app's chosen color-scheme.
    // https://vite.dev/config/build-options#build-csstarget
    cssTarget: 'chrome156',
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
});
