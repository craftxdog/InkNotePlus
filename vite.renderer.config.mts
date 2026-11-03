import { defineConfig } from 'vite';

// Vite transforms TSX natively. React Fast Refresh would require an inline
// preamble, so component changes use full reload under script-src 'self'.
export default defineConfig({
  optimizeDeps: {
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
});
