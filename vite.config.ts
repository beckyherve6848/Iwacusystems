import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAAFYV0tlnnhfxQE4V';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  let turnstileSiteKey = '';

  if (command === 'build' && mode === 'production') {
    const { VITE_TURNSTILE_SITE_KEY } = loadEnv(mode, process.cwd(), 'VITE_');
    const configuredSiteKey = VITE_TURNSTILE_SITE_KEY?.trim();
    turnstileSiteKey = configuredSiteKey && configuredSiteKey !== 'your-cloudflare-turnstile-site-key'
      ? configuredSiteKey
      : DEFAULT_TURNSTILE_SITE_KEY;
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(turnstileSiteKey),
    },
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
