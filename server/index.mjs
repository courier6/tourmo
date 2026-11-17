// Runs the lookup server by itself:  npm run lookups
//
// `npm run dev` already includes it, so this is only for serving the built
// app from somewhere else. It listens on this machine only. Point the app at
// it by setting VITE_LOOKUP_URL=http://localhost:8787 when building.

import { createServer } from 'node:http';
import { createLookups } from './lookups.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const { handle } = createLookups();

createServer(async (req, res) => {
  // The app may be served from another local port, so local pages are let in.
  const origin = req.headers.origin ?? '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  if (!(await handle(req, res))) {
    res.statusCode = 404;
    res.end('The lookup server only answers under /api/.');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Lookup server on http://localhost:${PORT}  (try /api/status)`);
});
