/**
 * theme.js — Theme/mode detection utilities
 *
 * Separated from main.js to avoid circular dependencies with cards.js
 */

/**
 * Checks explicit data-theme override first, then the system preference.
 */
export function isLightMode() {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light') return true;
  if (theme === 'dark')  return false;
  return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}
