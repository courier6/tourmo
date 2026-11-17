import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { lookupsPlugin } from './server/lookups.mjs';

export default defineConfig({
  // lookupsPlugin answers /api/ (live gas, lodging and road miles) from the dev server.
  plugins: [react(), lookupsPlugin()],
  server: { port: 5173 },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.mjs'] },
});
