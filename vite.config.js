import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Serve the pdf.js worker as .js so every host sends a JavaScript MIME type.
        assetFileNames: (info) =>
          (info.names?.[0] || info.name || '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: { environment: 'node' },
});
