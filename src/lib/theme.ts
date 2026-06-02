// Theme: follow system by default; a manual choice persists to localStorage and
// overrides system (§1.2). The initial attribute is set pre-paint in index.html.

export type Theme = 'light' | 'dark';
const KEY = 'trolley.theme';

export function getTheme(): Theme {
  return (document.documentElement.getAttribute('data-theme') as Theme) ?? 'light';
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  // Keep the browser chrome colour in step with the palette.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1A1613' : '#2F8F5B');
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
