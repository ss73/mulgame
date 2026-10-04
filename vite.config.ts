import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:lan` serves over HTTPS so phones on the same network can test:
// WebCrypto (used for leaderboard keys) only works in secure contexts.
export default defineConfig(({ mode }) => ({
  base: '/mulgame/',
  plugins: mode === 'lan' ? [basicSsl()] : [],
}));
