import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Self-hosted variable fonts (§10) — no Google round-trip, works offline.
// JetBrains Mono is imported lazily on the Reporting route only.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/hanken-grotesk';
import { initErrorLogging } from './lib/errorLog';
import './styles/tokens.css';
import './styles/global.css';

initErrorLogging();

// Capture an invite code from a /join/<code> link before the magic-link redirect
// reloads the page, so GroupSetup can prefill it after sign-in (§2.1).
const invite = window.location.pathname.match(/^\/join\/([^/]+)/);
if (invite) {
  try {
    sessionStorage.setItem('trolley.invite', invite[1]);
  } catch {
    /* ignore */
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
