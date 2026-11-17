// A very small hash router: "#/date/d1" works from a file server, a dev
// server or a home-screen install without any server setup.

import { useEffect, useState } from 'react';

const read = () => window.location.hash.replace(/^#/, '') || '/';

export function useRoute(): string[] {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path.split('/').filter(Boolean);
}

export const href = (path: string) => '#' + path;

export function go(path: string) {
  window.location.hash = path;
}
