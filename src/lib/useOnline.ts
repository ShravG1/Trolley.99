import { useEffect, useState } from 'react';

// Browser online/offline signal for UI gating. The real connectivity check lives
// in the sync engine (navigator.onLine lies on captive/poor networks); this is
// only for hinting on screen — worst case a control is disabled a moment early or
// late, and the server stays the real bouncer (§6.2).
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
