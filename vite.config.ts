import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    const { VITE_TURNSTILE_SITE_KEY } = loadEnv(mode, process.cwd(), 'VITE_');
    const siteKey = VITE_TURNSTILE_SITE_KEY?.trim();
    if (!siteKey || siteKey === 'your-cloudflare-turnstile-site-key') {
      throw new Error(
        'Production build blocked: set VITE_TURNSTILE_SITE_KEY to your Cloudflare Turnstile site key.',
      );
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
