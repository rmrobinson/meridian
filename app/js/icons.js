/**
 * icons.js — MDI icon path cache.
 *
 * Fetches individual SVG files from /assets/icons/ at startup, extracts the
 * <path d="..."> string, and caches it by icon ID. buildStation() calls
 * getIconPath() synchronously during scroll — the cache must be fully
 * populated before any rendering begins.
 *
 * Icon IDs use the "mdi:" prefix (e.g. "mdi:airplane-takeoff"). Unknown IDs
 * and missing files degrade gracefully — getIconPath() returns null and the
 * station renders without an icon.
 */

/** @type {Map<string, string|null>} mdi:icon-name → SVG path d string */
const iconCache = new Map();

/**
 * Pre-load all unique icon IDs found in the event set.
 * Must be awaited before the first call to buildStation().
 *
 * @param {object[]} events - Normalized events from api.js.
 */
export async function preloadIcons(events) {
  const ids = new Set(events.map((e) => e.icon).filter(Boolean));
  await Promise.all([...ids].map(loadIcon));
}

/**
 * Return the cached SVG path d-string for an icon ID, or null if unavailable.
 *
 * @param {string} iconId - e.g. "mdi:airplane-takeoff"
 * @returns {string|null}
 */
export function getIconPath(iconId) {
  return iconCache.get(iconId) ?? null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadIcon(iconId) {
  if (iconCache.has(iconId)) return;
  const name = iconId.replace(/^mdi:/, '');
  try {
    const res = await fetch(`/assets/icons/${name}.svg`);
    if (!res.ok) { iconCache.set(iconId, null); return; }
    const text = await res.text();
    // MDI SVG files contain a single <path d="..."> — extract its d attribute.
    const d = text.match(/\bd="([^"]+)"/)?.[1] ?? null;
    iconCache.set(iconId, d);
  } catch {
    iconCache.set(iconId, null);
  }
}
