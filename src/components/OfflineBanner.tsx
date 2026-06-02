import { useEffect, useState } from 'react';

// Offline policy (§6.6, §8.2): online-first. Reads come from cache; writes are
// disabled with a clear hint. This surfaces the "last list we had" banner.
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="sticky top-0 z-40 bg-ink px-4 py-1.5 text-center text-meta font-semibold text-[var(--bg)]">
      Offline. Showing the last list we had.
    </div>
  );
}
