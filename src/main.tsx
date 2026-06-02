import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/global.css';

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
