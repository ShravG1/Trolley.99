// Sets the theme before first paint to avoid a flash (§1.2). External (not
// inline) so the CSP can keep script-src 'self' with no unsafe-inline (§5.7).
// A manual choice in localStorage overrides the system preference.
(function () {
  try {
    var stored = localStorage.getItem('trolley.theme');
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', stored || sys);
  } catch (e) {
    /* no-op */
  }
})();
