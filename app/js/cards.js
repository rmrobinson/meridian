/**
 * cards.js — Detail card renderer registry.
 *
 * Selects the appropriate card template based on event properties:
 *   family_id === "spine"  → milestone card
 *   external_url set       → trip card
 *   photos.length > 0      → gallery card
 *   family_id === "books"  → book card
 *   family_id === "tv"     → show card
 *   default                → standard card
 *
 * Cards are HTML <div> overlays shown on station click. On desktop they float
 * beside the station; on mobile they slide up as a bottom sheet.
 */

// TODO: implement in Phase 3.
