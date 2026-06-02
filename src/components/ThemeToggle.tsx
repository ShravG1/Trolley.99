import { useState } from 'react';
import { getTheme, toggleTheme } from '@/lib/theme';
import { SunIcon, MoonIcon } from './icons';

// Theme toggle (§1.2) — persists the manual choice, overriding system.
export function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme());
  return (
    <button
      onClick={() => setThemeState(toggleTheme())}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="grid h-11 w-11 place-items-center rounded-pill text-ink-soft hover:bg-surface-2"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
