import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Default to '/dr5/' for GitHub Pages deployment
    const base = env.VITE_BASE || (mode === 'production' ? '/dr5/' : '/');
    const port = Number(env.VITE_PORT || 5173);
    return {
      base,
      server: {
        port,
        host: '0.0.0.0',
        strictPort: true,
        hmr: {
          host: 'localhost',
          port
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
