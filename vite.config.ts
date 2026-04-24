import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Serve web-ifc WASM as static asset
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      // Excluir web-ifc del pre-bundling de Vite; se carga directamente en el Worker
      exclude: ['web-ifc'],
    },
    worker: {
      // El worker usa módulos ES para poder importar web-ifc correctamente
      format: 'es',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
