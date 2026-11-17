// Writes the service worker into the build. Plain JavaScript, like the lookup
// server, so the project needs no type definitions for Node.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

/** The fonts are built for many alphabets. Only the Latin ones are kept on the device ahead of need. */
const keptAhead = (file) => /\.(js|css)$/.test(file) || /-latin-(ext-)?\d+-normal-.*\.woff2$/.test(file);

/**
 * Fills in offline/sw.js with the list of files to keep on the device and a
 * version that changes whenever any of them does. The built file names carry
 * a hash of their contents, so the list alone says what changed; the files in
 * public/ do not, so their contents are counted too.
 */
export function offlinePlugin() {
  return {
    name: 'tourmo-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const shared = readdirSync('public').sort();
      const files = ['./', ...Object.keys(bundle).filter(keptAhead).sort(), ...shared];
      const hash = createHash('sha256').update(JSON.stringify(files));
      for (const name of shared) hash.update(readFileSync('public/' + name));
      const source = readFileSync('offline/sw.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace("['__FILES__']", JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
