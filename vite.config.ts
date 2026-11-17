import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './offline/plugin.mjs';
import { lookupsPlugin } from './server/lookups.mjs';

export default defineConfig({
  // Relative paths, so the built app works from any folder of any static host.
  base: './',
  // lookupsPlugin answers /api/ (live gas, lodging and road miles) from the dev server.
  // offlinePlugin adds the service worker that keeps the built app on the device.
  plugins: [react(), lookupsPlugin(), offlinePlugin()],
  server: { port: 5173 },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.mjs'] },
});
