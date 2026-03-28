# Life Timeline App — Product & Architecture Plan

## Overview

A personal life timeline visualized as a vertical subway map. The most recent date sits at the top of the page; scrolling down travels back in time toward your birth year. Life events are rendered as stations on colored lines, with different categories of life (work, travel, books, etc.) each occupying their own branching track off a central spine.

The app is a static frontend (Vanilla HTML/CSS/JS, no framework, no build step) that fetches data from a personal REST API you control. It is designed to render well on both desktop and mobile from the outset.

---

## Core Mental Model

- **Y axis = time.** Top is today, bottom is birth year.
- **X axis = life tracks.** Each active line occupies a horizontal lane.
- **The Life Spine** is the root line. It runs the full height of the canvas, centered, and is the default parent for all episodic branches. It carries its own point events — birthdays, marriages, house moves, and other milestones that don't belong to any specific episodic line.
- **Episodic lines** branch off a parent line when an event or period starts, and either merge back into that parent or terminate when it ends. The parent is the spine by default, but any active episodic line can itself be a parent — enabling nested branches (e.g. a job that branches off an education line).
- **Branching is a tree, not a flat list.** The spine is the root. Episodic lines are children of the spine or of other episodic lines. Child lanes are always positioned outward from their parent — further from the spine — so the visual hierarchy is readable without labels.

The visual grammar is intentionally subway-map-like: straight vertical segments, smooth cubic bezier curves at branch and merge points, colored lines with labeled stations.

---

## Zoom Levels

Inspired by the "life in weeks" framework, the timeline has three zoom levels that change both the visual density and what information is shown.

| Level | Scale | What's visible |
|---|---|---|
| **Day** | ~2px per day | Every event as a full station with label |
| **Month** | Compressed | Events aggregated per month per line (e.g. "8 runs in March") |
| **Year** | Very compressed | Span lines only + major milestones; resembles "life in weeks" grid |

Zoom is controlled by a toggle in the UI or scroll-wheel modifier. The SVG `viewBox` re-scales and station labels show/hide via CSS classes. Animated transitions between zoom levels.

---

## Line Families

Lines are organized into **families**. A family defines the visual style, default side, and branching behavior. Individual lines within a family are spawned per event (e.g. each book gets its own line) or share a single persistent line (e.g. all fitness events share one green track).

### `spawn_behavior`

- **`per_event`** — each event in this family spawns its own independent SVG line (each book, each job, each trip is its own track)
- **`single_line`** — all events in this family share one persistent line (fitness, where individual runs are just dots on a single track)

### Family Catalog

| Family | Base Color (HSL) | Side | On End | Spawn Behavior |
|---|---|---|---|---|
| Life Spine | `[0, 0, 80]` | Center | Never ends | — |
| Employment | `[210, 70, 50]` | Left | Merge to spine | per_event |
| Education | `[270, 60, 55]` | Left | Merge to spine | per_event |
| Travel | `[50, 85, 50]` | Right | Merge to spine | per_event |
| Books | `[30, 70, 50]` | Right | Terminate | per_event |
| Film & TV | `[300, 60, 55]` | Right | Terminate | per_event |
| Fitness & Health | `[140, 65, 45]` | Right | Terminate | single_line |
| Hobbies | `[180, 55, 45]` | Left | Terminate | per_event |

### Color Assignment Within Families

For families with `per_event` spawn behavior, individual lines share the family's base hue but are assigned different lightness/saturation values to remain visually distinct. These are computed programmatically using HSL:

```
base hue: 30 (orange, for books)
book 1:   hsl(30, 70%, 45%)
book 2:   hsl(30, 55%, 62%)
book 3:   hsl(30, 85%, 38%)
```

The frontend generates these from the family's `base_color_hsl` — no per-book color needs to be stored in the API.

### Side Assignment & Conflict Resolution

Each family has a preferred side (left or right of spine). If a new branch needs to spawn on its preferred side but all lanes are occupied by concurrent active lines, the layout engine places it on the opposite side. This is handled automatically — no manual override needed.

---

## Event Types

### Span Events
Have a `start_date` and `end_date`. Rendered as a line segment running between those two Y positions. Used for: jobs, education, trips, books, TV series, multi-day hobbies.

### Point Events
Have a single `date`. Rendered as a station dot on the relevant line. Used for: individual movies, concerts, single runs (on the fitness line), one-day hikes.

**Rule of thumb:** anything with a meaningful duration (more than one day) should be a span. Single-day or sub-day events are points.

---

## Data Model (API Contract)

### `GET /api/timeline`

Returns all data needed to render the full map. In v1 this is a single endpoint returning everything. Pagination and filtering can be added later once event counts grow.

```json
{
  "person": {
    "name": "Your Name",
    "birth_date": "1990-04-12"
  },
  "line_families": [
    {
      "id": "books",
      "label": "Books",
      "base_color_hsl": [30, 70, 50],
      "side": "right",
      "on_end": "terminate",
      "spawn_behavior": "per_event"
    },
    {
      "id": "tv",
      "label": "TV Shows",
      "base_color_hsl": [300, 60, 55],
      "side": "right",
      "on_end": "terminate",
      "spawn_behavior": "per_event"
    },
    {
      "id": "employment",
      "label": "Employment",
      "base_color_hsl": [210, 70, 50],
      "side": "left",
      "on_end": "merge",
      "spawn_behavior": "per_event"
    },
    {
      "id": "travel",
      "label": "Travel",
      "base_color_hsl": [50, 85, 50],
      "side": "right",
      "on_end": "merge",
      "spawn_behavior": "per_event"
    },
    {
      "id": "fitness",
      "label": "Fitness & Health",
      "base_color_hsl": [140, 65, 45],
      "side": "right",
      "on_end": "terminate",
      "spawn_behavior": "single_line"
    },
    {
      "id": "education",
      "label": "Education",
      "base_color_hsl": [270, 60, 55],
      "side": "left",
      "on_end": "merge",
      "spawn_behavior": "per_event"
    },
    {
      "id": "hobbies",
      "label": "Hobbies",
      "base_color_hsl": [180, 55, 45],
      "side": "left",
      "on_end": "terminate",
      "spawn_behavior": "per_event"
    }
  ],
  "events": [
    {
      "id": "evt_000",
      "family_id": "spine",
      "line_key": "spine",
      "type": "point",
      "title": "Moved to London",
      "date": "2019-09-01",
      "location": {
        "label": "London, UK",
        "lat": 51.5074,
        "lng": -0.1278
      },
      "description": "Relocated from Edinburgh.",
      "external_url": null,
      "hero_image_url": null,
      "photos": [],
      "metadata": {
        "milestone_type": "relocation"
      }
    },
    {
      "id": "evt_001",
      "family_id": "employment",
      "line_key": "acme-corp",
      "parent_line_key": null,
      "type": "span",
      "title": "Acme Corp",
      "start_date": "2015-06-01",
      "end_date": "2018-11-30",
      "location": {
        "label": "San Francisco, CA",
        "lat": 37.7749,
        "lng": -122.4194
      },
      "description": "Software engineer, worked on payments infra.",
      "external_url": null,
      "hero_image_url": null,
      "photos": [],
      "metadata": {
        "role": "Senior Engineer"
      }
    },
    {
      "id": "evt_001b",
      "family_id": "employment",
      "line_key": "uni-placement-2012",
      "parent_line_key": "university-2010",
      "type": "span",
      "title": "Summer Placement — CERN",
      "start_date": "2012-06-01",
      "end_date": "2012-08-31",
      "location": {
        "label": "Geneva, Switzerland",
        "lat": 46.2044,
        "lng": 6.1432
      },
      "description": "Summer research placement during second year.",
      "external_url": null,
      "hero_image_url": null,
      "photos": [],
      "metadata": {
        "role": "Research Intern"
      }
    },
    {
      "id": "evt_002",
      "family_id": "travel",
      "line_key": "japan-2023",
      "type": "span",
      "title": "Japan Trip",
      "start_date": "2023-03-10",
      "end_date": "2023-03-24",
      "location": {
        "label": "Japan",
        "lat": 36.2048,
        "lng": 138.2529
      },
      "description": "Two weeks in Tokyo and Kyoto.",
      "label": "Japan",
      "icon": "airplane-takeoff",
      "external_url": "https://yourblog.netlify.app/japan-2023",
      "hero_image_url": "https://yourblog.netlify.app/images/japan-hero.jpg",
      "photos": [],
      "metadata": {
        "countries": ["Japan"],
        "cities": ["Tokyo", "Kyoto"]
      }
    },
    {
      "id": "evt_003",
      "family_id": "books",
      "line_key": "dune-2022",
      "type": "span",
      "title": "Dune",
      "start_date": "2022-07-20",
      "end_date": "2022-08-14",
      "location": null,
      "description": "Frank Herbert's masterpiece.",
      "label": "Dune",
      "icon": "book",
      "external_url": null,
      "hero_image_url": null,
      "photos": [],
      "metadata": {
        "author": "Frank Herbert",
        "rating": 5,
        "review": "Incredible world-building and political depth."
      }
    },
    {
      "id": "evt_004",
      "family_id": "hobbies",
      "line_key": "glastonbury-2023",
      "type": "point",
      "title": "Glastonbury Festival",
      "date": "2023-06-23",
      "location": {
        "label": "Glastonbury, UK",
        "lat": 51.1444,
        "lng": -2.7150
      },
      "description": "Weekend at Glastonbury.",
      "external_url": null,
      "hero_image_url": null,
      "photos": [
        "https://your-cdn.com/glastonbury-1.jpg",
        "https://your-cdn.com/glastonbury-2.jpg"
      ],
      "metadata": {}
    }
  ]
}
```

### Field Reference

| Field | Type | Notes |
|---|---|---|
| `parent_line_key` | string or null | The `line_key` of the parent line this event branches from. `null` means the spine is the parent. Use to attach a job to an education line, etc. |
| `label` | string or null | Short display string shown beside the station on the map. Falls back to a truncated `title` if absent. Keep to 2–4 words. |
| `icon` | string or null | Icon ID referencing the central icon sprite (e.g. `"airplane-takeoff"`, `"book"`, `"ski"`). Optional. |
| `id` | string | Unique event ID |
| `family_id` | string | References a `line_families` entry |
| `line_key` | string | Groups events onto the same SVG line. For `per_event` families, unique per event. For `single_line` families, all events share the same key. |
| `type` | `"span"` or `"point"` | Determines which date fields are used |
| `start_date` / `end_date` | ISO 8601 date | Used when `type: "span"` |
| `date` | ISO 8601 date | Used when `type: "point"` |
| `location` | object or null | `{ label, lat, lng }` — first-class field, not in metadata |
| `external_url` | string or null | Link out (e.g. travel blog post) |
| `hero_image_url` | string or null | Summary image for trip cards |
| `photos` | array of strings | URLs for gallery display |
| `metadata` | object | Free-form, schema varies by family (see below) |

### Metadata Schemas by Family

```json
// spine
{ "milestone_type": "birthday" }
// milestone_type options: birthday, marriage, relocation, bereavement, other
//
// Birthday handling:
// Birthdays are auto-generated by the frontend from person.birth_date — one per
// year up to today. No API entry is needed. Each renders as a standard spine
// station labeled "Birthday — Age N".
//
// To enrich a specific birthday with additional content (photos, notes, location),
// add an explicit spine event with milestone_type: "birthday" on that date. The
// frontend matches by date and merges: the explicit event replaces the auto-generated
// one, and any extra metadata (description, photos, location, linked events) is shown
// in the card alongside the standard age/date info.
//
// If an explicit event includes a title (e.g. "30th Birthday"), that title is used
// instead of the auto-generated "Birthday — Age N" label.

// employment
{ "role": "Senior Engineer", "company_url": "https://acme.com" }

// education
{ "institution": "MIT", "degree": "BSc Computer Science" }

// travel
{ "countries": ["Japan"], "cities": ["Tokyo", "Kyoto"] }

// books
{ "author": "Frank Herbert", "rating": 5, "review": "..." }

// tv
{ "network": "HBO", "seasons_watched": 3, "rating": 4 }

// fitness
{ "activity": "run", "distance_km": 42.2, "duration": "3:47:00" }

// hobbies
{ "activity": "concert", "artist": "Radiohead" }
```

---

## REST API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/timeline` | Full data dump — all families and events |
| `GET` | `/api/events` | Filtered events (`?family=travel&from=2020-01-01`) |
| `POST` | `/api/events` | Add a new event |
| `PUT` | `/api/events/:id` | Edit an event |
| `DELETE` | `/api/events/:id` | Remove an event |
| `GET` | `/api/lines` | Get line family definitions |
| `PUT` | `/api/lines/:id` | Edit a family (color, label, side, etc.) |

For v1, `GET /api/timeline` returning everything is sufficient. The filtered endpoint becomes useful once you have thousands of fitness or reading events and want to avoid fetching the full dataset on every load.

---

## Frontend Architecture

No framework. No build step. ES modules via `type="module"` for clean file separation.

```
/app
  index.html
  /css
    main.css          — page layout, UI chrome, fonts
    timeline.css      — station labels, zoom state classes
    cards.css         — detail card styles (standard, trip, gallery, book)
  /js
    main.js           — bootstrap, API fetch, wires modules together
    api.js            — fetch + normalize API response; also generates auto birthday events from person.birth_date
    timeline.js       — root SVG canvas, scroll container, virtualized render window
    lanes.js          — lane assignment algorithm
    lines.js          — SVG path generation (segments + bezier curves)
    stations.js       — event dot rendering, icon loading + caching, hover/click targets
    cards.js          — detail card renderer registry
    zoom.js           — zoom level state, viewBox transitions
  /assets
    /icons            — curated MDI SVG files, one per referenced icon
    (fonts)
  /scripts
    check-icons.js    — pre-commit validation: ensures all icon IDs in data files have a corresponding file in /assets/icons/
  /tests
    unit/
      lanes.test.js
      lines.test.js
      api.test.js
      zoom.test.js
      stations.test.js
    integration/
      desktop.spec.js
      mobile.spec.js
      responsive.spec.js
    fixtures/
      mock-timeline.json  — fixed dataset used by all tests
```

MapLibre GL JS can be dropped into this structure later as an additional script — it is designed to work with plain JS and doesn't require a build step.

### Why No JS Framework?

The gallery card and rich media cards might suggest a framework is needed, but they don't justify the overhead. The card system is: one hidden `<div>` per card type, shown/hidden on station click, populated via plain DOM manipulation. A gallery is a CSS grid of `<img>` tags injected into that div. Frameworks solve problems like reactive state across many components and complex re-renders — neither of which apply here.

The timeline has two meaningful pieces of state: which card is open, and the current zoom level. Both are trivial to manage in vanilla JS.

A framework *would* earn its keep if you later built a rich in-app event editor (adding and editing events without touching the API directly). That could always live as a separate `/editor` page if needed, and could use a framework independently without affecting the timeline renderer.

---

## Layout Engine

This is the most complex part of the app. Here is the algorithm in full:

### Step 1 — Time Scale

Map the full date range (birth date → today) to a pixel height.

```
timeToY(date) = (today - date) / (today - birthDate) * totalCanvasHeight
```

At day zoom: ~2px per day. A 35-year life ≈ 25,550 days ≈ 51,100px canvas. This requires a **virtualized renderer** — only the portion of the SVG in or near the viewport is actively rendered. Offscreen elements are removed from the DOM and re-added as you scroll.

### Step 2 — Lane Assignment

The spine is treated as the root node with X = center. All other lines are children of the spine or of another active episodic line. Lane assignment walks events sorted by `start_date` and resolves each line's X position relative to its parent:

- When a span starts: look up its `parent_line_key` (defaults to spine if null). Assign it the innermost free lane on its family's preferred side, measured outward from the parent's X — not from the spine. This ensures child lines always sit further from the spine than their parent, making hierarchy visually legible.
- When a span ends: free that lane. If `on_end: "merge"`, the line's end bezier curves back to the parent's X (not necessarily the spine).
- Point events: inherit their line's current lane.

The result is a tree of X positions. The spine is the root at X = center. A university education line might sit at X = center − 80px. A placement job branching from that education line sits at X = center − 160px. A job branching directly from the spine sits at X = center + 80px (right side).

### Step 2a — Concurrent Spans Within a Family

Multiple spans from the same family can be active simultaneously (two books being read at once, two jobs during a transition period). The lane algorithm handles these like any other concurrent spans — each gets its own lane — but with one additional rule: **sibling lanes from the same family are placed adjacent to each other**, innermost first. This keeps concurrent books visually grouped rather than scattered across the canvas.

On desktop (sufficient width), each sibling gets its own lane at normal line weight. On mobile (collapsed lane view), siblings from the same family that are concurrent are **merged into a single bolder line** whose stroke weight scales with the number of active siblings:

```
1 active:  stroke-width: 3px  (normal)
2 active:  stroke-width: 5px  (bold, indicating multiplicity)
3 active:  stroke-width: 7px
```

When one sibling ends while others remain active, its termination station renders at the correct Y position, then the merged line continues at the reduced weight for the remaining count. If the last sibling ends, the line terminates normally. The collapsed line is tappable and opens a summary card listing all currently active siblings, from which you can tap into an individual event's detail card.

### Step 3 — Path Generation

For each active line:
- **Straight segment:** vertical `<path>` from `timeToY(start)` to `timeToY(end)` at the assigned lane X
- **Branch-off:** the departure station is rendered on the parent line at the branch start date. The bezier curve originates from that station's position on the parent, then curves outward to the branch lane X over ~30px of Y. The first subsequent event on the branch renders at its own Y position along the branch line.
- **Merge-back:** the branch line runs to its end date, then a bezier curve travels from the branch lane X back to the parent's X. The final station marker is rendered at the end of that curve — on the parent line, not the branch. This mirrors the departure: departure station on parent → curve out to branch; arrival station on parent → curve in from branch. The branch itself carries no terminal station marker.  For `on_end: "terminate"` lines, the final station sits on the branch line with no return curve, since there is no parent to return to.

This rule applies at all levels of the branch tree — when a job departs from an education line, the departure station sits on the education line; the job's final station sits on the job line before the merge curve returns to education.

Since the spine is just a parent with a known X, the bezier logic is identical for all cases — no special-casing needed for spine vs non-spine parents.

Example branch bezier (branching right from any parent at parentX):
```
M parentX, branchY        ← departure station rendered here on parent line
C parentX, branchY+15, laneX, branchY+15, laneX, branchY+30
                           ↑ first event on branch renders at laneX, its own Y
```

Example merge bezier (returning left from branch at laneX back to parentX):
```
M laneX, mergeY           ← branch line ends here, no station marker
C laneX, mergeY+15, parentX, mergeY+15, parentX, mergeY+30
                           ↑ arrival station rendered here on parent line
```

### Step 4 — Station Rendering

Place `<circle>` elements at the correct `(laneX, timeToY(date))` for each visible event. Each station has three visual components whose presence depends on zoom level:

**Station dot** — always rendered at all zoom levels. The dot is never hidden or replaced by an icon.

**Icon** — rendered as an inline SVG sourced from locally stored MDI files. Icons always sit to the right of the station dot. The dot is always rendered — icons never replace it. Icon visibility is zoom-dependent:
- `ZOOM_DAY`: always visible
- `ZOOM_MONTH`: visible on hover/tap only, matching label behaviour
- `ZOOM_YEAR`: hidden

**Label** — the short `label` string (or truncated `title` if absent) rendered as a `<text>` element:
- `ZOOM_DAY`: always visible, positioned beside the station.
- `ZOOM_MONTH`: visible on hover/tap only, to avoid overlapping aggregate labels.
- `ZOOM_YEAR`: hidden entirely — only icons or dots visible at this density.

On hover/tap, the full label always appears regardless of zoom level, overriding the suppressed state. Detail card opens on click/tap as before.

### Step 5 — Aggregation at Month/Year Zoom

At month zoom: group point events by `(family_id, year-month)` bucket. Replace clusters with a single aggregate station labeled "8 runs" or "3 books finished". Span events are never aggregated — they always render as continuous lines.

At year zoom: hide all point events entirely. Show only span lines and a single milestone station per span at its midpoint.

---

## Icon System

Icons use the [Material Design Icons](https://pictogrammers.com/library/mdi/) (MDI) open-source set. MDI icons are clean single-path SVGs on a 24×24 viewBox, rendering crisply at any size and inheriting `currentColor` naturally for light/dark mode compatibility.

### Storage

Individual MDI SVG files are manually retrieved and stored in `/assets/icons/`. Only icons actually referenced in events need to be present — this is not a full MDI install. Icons are downloaded from [pictogrammers.com](https://pictogrammers.com/library/mdi/) or sourced from the [`@mdi/svg`](https://github.com/Templarian/MaterialDesign-SVG) package and copied into the directory manually. This avoids any runtime dependency on an external service.

The renderer loads each icon file once at startup, caches the path `d` string in memory, and reuses it for all stations referencing that icon — no repeated file reads during scroll.

### Icon ID Format

Events reference icons using a prefixed ID format: `mdi:icon-name`. The prefix allows other icon sets to be introduced later without a data migration. The renderer strips the `mdi:` prefix, looks up `/assets/icons/{icon-name}.svg`, extracts the `<path d="...">` attribute, and injects it into an inline `<svg>` at the station position.

```json
{ "icon": "mdi:airplane-takeoff" }
```

Unknown icon IDs and missing files both degrade gracefully — the station renders without an icon rather than erroring.

### Commit-Time Validation Script

A pre-commit hook runs `/scripts/check-icons.js` to ensure every icon referenced in the codebase has a corresponding file in `/assets/icons/`. This prevents committing events that reference icons not yet added to the project.

The script:
1. Scans `tests/fixtures/mock-timeline.json` and any other JSON data files for `"icon"` field values
2. Strips the `mdi:` prefix from each value
3. Checks that `/assets/icons/{icon-name}.svg` exists
4. Exits non-zero with a clear error message listing missing files if any are absent

```
/scripts
  check-icons.js    — pre-commit icon validation script
```

Setup in `.git/hooks/pre-commit`:
```bash
#!/bin/sh
node scripts/check-icons.js
```

Or via a `package.json` lint-staged / husky config if those are already present.

### Rendering

Icons are rendered as inline `<svg>` elements at each station. The renderer loads the icon file once per icon ID at startup, caches the path `d` string in memory, and reuses it for all stations referencing that icon — no repeated file reads during scroll.

```js
// Conceptual — in stations.js
const iconCache = new Map();

async function getIconPath(iconId) {
  if (iconCache.has(iconId)) return iconCache.get(iconId);
  const name = iconId.replace('mdi:', '');
  const res = await fetch(`/assets/icons/${name}.svg`);
  const text = await res.text();
  const d = text.match(/d="([^"]+)"/)?.[1] ?? null;
  iconCache.set(iconId, d);
  return d;
}
```

### Icon Placement by Zoom

| Zoom | Icon position | Dot | Label | Icon visibility |
|---|---|---|---|---|
| Day | Right of dot | Visible | Always visible | Always visible |
| Month | Right of dot | Visible | Hover/tap only | Hover/tap only |
| Year | Right of dot | Visible | Hidden | Hidden |

---

## Detail Card System

Cards are HTML `<div>` overlays that appear on station click. The card renderer selects a template based on the event's properties:

| Condition | Card Type |
|---|---|
| `family_id === "spine"` | **Milestone card** — icon by milestone_type, title (auto-derived for birthdays), date, age (for birthdays), location, description, photos if present |
| `external_url` is set | **Trip card** — hero image, title, dates, description, location, "Read post →" button |
| `photos.length > 0` | **Gallery card** — photo grid, title, date, location, map pin |
| `family_id === "books"` | **Book card** — title, author, date range, star rating, review excerpt |
| `family_id === "tv"` | **Show card** — title, network, date range, seasons, rating |
| default | **Standard card** — title, dates, description, location |

All cards show a small map pin linking to the event's `location` if one is set. The full MapLibre map integration (clicking a pin to see an interactive map) is a later phase.

---

## Travel Blog Integration

Your Hugo/Netlify blog is the source of truth for trip content.

**v1 approach (recommended):** Store `external_url` and `hero_image_url` directly in your events API. The timeline fetches these as part of the normal `/api/timeline` response and renders them in the trip card. No cross-origin requests to the blog.

**Future upgrade:** Hugo supports JSON output formats. Adding one to your blog config produces a machine-readable feed at `/index.json`. Your events API could then auto-populate trip summaries and hero images by referencing post slugs — keeping the two sites in sync without manual duplication.

---

## Mobile Design

Mobile is a first-class concern, not a retrofit. The subway map metaphor creates a real tension on small screens: horizontal space is scarce, but the map wants to spread lanes left and right of the spine. These patterns resolve it cleanly.

### Collapsed Lane View

On small screens, don't show all lines simultaneously. Show the spine plus only the lines that are active at the current scroll position. Lines outside the visible time range are hidden until you scroll into them. This keeps the canvas to 2-3 lanes wide at any moment rather than rendering the full simultaneous width.

### Touch Targets

Station circles may be visually small (8-12px radius) but need to be at least 44px square as tap targets. This is handled with an invisible `<rect>` or `<circle>` hit area behind each station in the SVG — no change to the visual design.

### Card Presentation

On desktop, detail cards float beside the station that was clicked. On mobile, cards slide up from the bottom as a bottom sheet — full viewport width, partially covering the timeline. Dismissing the card slides it back down. This is a CSS + small JS pattern, no library needed.

### Zoom Control

On desktop, zoom is a toggle button group or scroll-wheel modifier. On mobile, it is a 3-segment control (`Day / Month / Year`) pinned at the top of the screen — always accessible without scrolling.

### Line Family Filter

On desktop, a sidebar or top bar shows line family toggles (show/hide individual tracks). On mobile, this becomes a bottom drawer triggered by a filter icon — slides up, shows family toggles as large tap-friendly chips, dismisses on close.

### Breakpoints

| Breakpoint | Layout |
|---|---|
| `< 480px` | Mobile: collapsed lanes, bottom sheet cards, segmented zoom control |
| `480px – 768px` | Tablet: 4-5 lanes visible, cards as side panels |
| `> 768px` | Desktop: full lane display, floating cards, sidebar filters |

All breakpoints are handled with CSS media queries. The JS layer checks `window.innerWidth` only for interaction behavior (bottom sheet vs floating card), not for rendering logic.

---

---

## Light & Dark Mode

The app supports both light and dark mode, driven by system preference by default with a manual override available.

### Implementation Approach

All colors are defined as CSS custom properties (tokens) on the `:root` element. No color value appears anywhere in the codebase except in the token definitions. CSS, SVG attributes, and any inline styles all reference tokens via `var(--token-name)`.

A `prefers-color-scheme: dark` media query redefines the token set for dark mode. A `data-theme` attribute on `<html>` allows manual override, set by a toggle in the UI and persisted to `localStorage`.

```css
:root {
  /* Light mode defaults */
  --color-background:   #f5f5f5;
  --color-surface:      #ffffff;
  --color-spine:        #333333;
  --color-label:        #222222;
  --color-label-muted:  #666666;
  --color-border:       #dddddd;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-background:   #0f0f0f;
    --color-surface:      #1a1a1a;
    --color-spine:        #cccccc;
    --color-label:        #f0f0f0;
    --color-label-muted:  #999999;
    --color-border:       #333333;
  }
}

[data-theme="dark"] {
  /* Same values as dark media query — allows JS override */
  --color-background:   #0f0f0f;
  /* ... */
}

[data-theme="light"] {
  /* Same values as light defaults — allows JS override */
  --color-background:   #f5f5f5;
  /* ... */
}
```

### Line Family Colors

The HSL color family system adapts to mode by adjusting lightness in the token definitions. Line family base colors are also defined as tokens, with light and dark variants:

```css
:root {
  --family-books-h: 30;
  --family-books-s: 70%;
  --family-books-l: 45%;   /* darker line on light background */
}

@media (prefers-color-scheme: dark) {
  :root {
    --family-books-l: 65%;  /* lighter line on dark background */
  }
}
```

The frontend's HSL variant generator reads the base lightness from the token and computes sibling variants relative to it, so concurrent book lines automatically adjust for the current mode.

### SVG Color Usage

SVG `stroke` and `fill` attributes must use `var()` references, not hardcoded values:

```svg
<!-- Correct -->
<path stroke="var(--color-spine)" fill="none" />
<circle fill="var(--family-books-color)" />

<!-- Wrong — will not respond to mode changes -->
<path stroke="#333333" fill="none" />
```

### User Preference Toggle

A sun/moon icon toggle in the UI header sets `data-theme="light"` or `data-theme="dark"` on `<html>` and persists the choice to `localStorage`. On load, `main.js` reads `localStorage` first, falls back to `prefers-color-scheme`, and applies the appropriate `data-theme` attribute before first render to avoid a flash of the wrong theme.

All photos are stored in an S3 bucket. The `photos[]` array and `hero_image_url` field in events contain direct S3 URLs (or CloudFront URLs if a CDN distribution is placed in front of the bucket).

**Recommended S3 structure:**

```
s3://your-bucket/
  timeline/
    events/
      evt_002/
        hero.jpg
        photo-1.jpg
        photo-2.jpg
      glastonbury-2023/
        photo-1.jpg
        photo-2.jpg
```

**Image sizing:** Gallery cards and trip hero images should not load full-resolution originals. Store two variants per photo:

| Variant | Max dimension | Use |
|---|---|---|
| `hero.jpg` | 1200px wide | Trip card hero image |
| `thumb.jpg` | 400px wide | Gallery grid thumbnails |
| `original.jpg` | Full resolution | Lightbox / download |

Your events API stores the base path (`https://your-bucket.s3.amazonaws.com/timeline/events/evt_002/`) and the frontend appends the appropriate suffix based on context. This avoids storing three separate URLs per photo in the API.

**S3 bucket policy:** The bucket should be public-read for the `timeline/` prefix so the frontend can load images directly without a signed URL flow. If you want privacy, CloudFront signed URLs are the right upgrade path.

---

## Performance Strategy

A 35-year timeline at day zoom is ~51,000px of canvas. Performance is designed in from the start — not retrofitted. The strategy has three layers: virtualized rendering, image lazy loading, and data windowing.

### Virtualized SVG Rendering

The SVG canvas never renders its full height. Only elements within a **render window** — the current viewport plus a buffer of ~1.5x viewport height above and below — are live in the DOM. As the user scrolls, an `IntersectionObserver` (or a `scroll` event with `requestAnimationFrame` throttling) continuously calculates which Y range is visible and syncs the DOM accordingly.

Elements outside the window are removed. Their lane positions and Y coordinates are pre-computed once at load time and stored in memory — the DOM is just a view over that data.

This is implemented in `timeline.js` as the core rendering loop from Phase 1. Everything else is built on top of it. **Starting without virtualization and adding it later is not an option** — the scroll and coordinate system must be designed around it from day one.

### Image Lazy Loading

Images in gallery cards and trip hero slots use the native `loading="lazy"` attribute as a baseline. For the gallery grid specifically, photos outside the visible card area use an `IntersectionObserver` to swap a low-resolution placeholder for the real thumbnail only when the image enters the viewport.

S3 thumbnail variants (`thumb.jpg`, 400px) are used in the gallery grid. Full-resolution originals are only loaded in a lightbox on explicit tap/click. Hero images use the `hero.jpg` variant (1200px), not the original.

### Data Windowing (future)

In v1, `GET /api/timeline` returns all events in a single response. This is fine up to a few hundred events. Once fitness logs, daily reading entries, and years of point events accumulate into the thousands, the API should support a `?from=&to=` date range filter so the frontend only fetches data for the visible time window plus a buffer. The frontend data model is designed to support this — events are indexed by date in memory so a window swap is a filter operation, not a re-render from scratch.

### Pre-computation at Load Time

All layout calculations (lane assignments, Y coordinates, bezier control points, concurrent sibling groupings) happen once when the API response is received, before any rendering. The result is a flat array of render-ready objects — each with its final X, Y, path data, and display state — that the virtualized renderer consumes. No layout work happens during scroll.

---

## Testing Strategy

Tests are written alongside the code, not after. The test suite covers two categories: unit tests for the layout engine and integration/visual tests for desktop and mobile rendering behavior.

### Test Stack

| Tool | Purpose |
|---|---|
| **Vitest** | Unit tests — fast, no browser needed, ESM-native |
| **Playwright** | Integration and visual regression tests — real browser, desktop and mobile viewports |

No build step is needed for Vitest since the source is already ESM. Playwright runs against a locally served version of the app.

### Unit Tests (Vitest)

These test the logic modules in isolation with no DOM dependency.

**`stations.test.js`**
- Station with icon renders icon to the right of the dot at all zoom levels
- Station dot always renders regardless of zoom level and icon presence
- Icon always visible at day zoom, hover-only at month zoom, hidden at year zoom
- Label visible at day zoom, hover-only at month zoom, hidden at year zoom
- Station without icon renders dot only, no icon element in DOM
- Unknown icon ID renders station without icon, no error thrown
- Label falls back to truncated title when `label` field is absent

**`lanes.test.js`**
- Single span assigned to correct preferred side
- Concurrent spans from different families assigned to correct sides
- Concurrent spans from the same family assigned to adjacent sibling lanes
- Lane freed correctly when a span ends
- Overflow to opposite side when preferred side is full
- Sibling count tracked correctly as concurrent spans start and end
- Nested branch assigned outward from parent line X, not from spine X
- Nested branch merge-back returns to parent X, not spine X
- Nested branch during an inactive parent is flagged as a data error

**`lines.test.js`**
- `timeToY()` returns correct pixel values for known dates
- `timeToY()` handles birth date (returns max Y) and today (returns 0)
- Branch bezier control points computed correctly for left and right sides
- Merge bezier is the mirror of the branch bezier

**`api.test.js`**
- Birthday auto-generation produces correct count from birth date to today
- Auto-generated birthday on a date with an explicit spine event is replaced, not duplicated
- Explicit birthday with a custom title uses that title instead of auto-derived label
- Response normalization handles null `location`, empty `photos`, missing optional fields

**`zoom.test.js`**
- Month aggregation groups point events correctly by `(family_id, year-month)`
- Aggregation label reflects correct count ("8 runs", "3 books finished")
- Span events are never included in aggregation
- Year zoom hides all point events and shows only span midpoint stations

### Integration & Visual Tests (Playwright)

These run in a real browser against the served app using a fixed mock dataset so results are deterministic.

**Desktop viewport (1280×800)**
- Spine renders full height from birth year to current year
- Trip span branches right of spine with a visible bezier curve
- Employment span branches left of spine
- Two concurrent book spans render as adjacent sibling lanes on the right
- Nested branch (placement job off education line) renders outward from education line, not from spine
- Clicking a station opens the correct card type (trip card, book card, etc.)
- Zoom toggle switches between Day / Month / Year and updates visible stations
- Birthday stations render at correct Y positions for each year
- Explicit birthday event replaces auto-generated station at that date

**Mobile viewport (390×844 — iPhone 14)**
- Canvas renders within viewport width with no horizontal overflow
- Two concurrent book spans collapse into a single bolder line
- When one book ends, its termination station renders and the line continues at reduced weight
- Tapping a station opens a bottom sheet card (not a floating card)
- Bottom sheet dismisses on swipe down or close tap
- Zoom segmented control is visible and pinned at top
- Touch targets on stations are at least 44×44px (verified via bounding box)

**Responsive transitions**
- Resizing viewport from 1280px to 390px switches card presentation from floating to bottom sheet
- Resizing from 390px to 1280px shows full concurrent sibling lanes (not collapsed)

### Running Tests

```
# Unit tests
npx vitest

# Integration tests (requires app running on localhost:3000)
npx playwright test

# Visual regression (generates screenshots on first run, diffs on subsequent)
npx playwright test --update-snapshots
```

---

## Build Phases

### Phase 1 — Skeleton, Virtualized Renderer & Static Data
- Scrollable SVG canvas with virtualized render window (IntersectionObserver + render buffer)
- Pre-computation pipeline: load data → compute all layout → store render objects → pass to renderer
- Life spine rendering (full height, birth to today) using virtual window
- Year markers on the time axis
- Mock JSON data file (no real API yet)
- One episodic line rendered (a single trip span) with branch and merge beziers
- CSS custom property token system established for all colors (`--color-spine`, `--color-background`, `--color-surface`, `--color-label`, etc.) — all CSS and SVG elements reference tokens, never hardcoded hex or HSL values
- Light and dark mode token sets defined via `prefers-color-scheme` media query, with a manual override class (`data-theme="dark"`) for user preference
- All SVG stroke and fill attributes use `var(--token-name)` so mode switching requires no JS and no re-render
- Vitest setup + first unit tests for `timeToY()` and lane assignment
- Playwright setup + first integration test confirming spine renders at correct Y positions on desktop and mobile

### Phase 2 — Full Line Rendering
- All 7 line families implemented
- Lane assignment algorithm handling concurrent and sibling spans
- Concurrent sibling collapse on mobile (bold line + weight transitions)
- Color family generation (HSL variants per family)
- Station labels rendered beside each station at day zoom, using `label` field with `title` fallback
- Icon sprite sheet created with starter icon set; icons render beside dot at day zoom
- Unit tests: full lane assignment suite, sibling grouping, mobile collapse logic

### Phase 2.5 — Zoom Infrastructure

This phase exists to wire zoom into the coordinate system before interactivity is built on top of it in Phase 3. The UI toggle does not exist yet — zoom level is set by a hardcoded constant that Claude Code can flip manually to verify each mode renders correctly. Phase 3 then only needs to build the UI controls and transition animations, with no coordinate system changes required.

- Create `zoom.js` with the three zoom level definitions and their pixels-per-day values:
  ```
  ZOOM_DAY:   2px per day   (~51,100px total for a 35-year life)
  ZOOM_MONTH: 0.25px per day (~6,400px total)
  ZOOM_YEAR:  0.07px per day (~1,800px total)
  ```
- Refactor `timeToY(date)` in `lines.js` to accept zoom level as a parameter rather than using a hardcoded scale. All existing callers updated to pass the current zoom state.
- Refactor the virtualized renderer in `timeline.js` to re-compute the render window and total canvas height when zoom level changes. A `setZoom(level)` function triggers a full re-layout from the pre-computed render objects — no API re-fetch needed.
- Implement aggregation logic in `zoom.js`:
  - At `ZOOM_MONTH`: group point events by `(family_id, year-month)` bucket, replace with a single aggregate station labeled "8 runs" or "3 books finished". Span events always render as continuous lines regardless of zoom.
  - At `ZOOM_YEAR`: suppress all point events entirely. Render only span line segments and a single midpoint station per span.
- Implement zoom-dependent label and icon behaviour: at month zoom both labels and icons are hover/tap only; at year zoom both are hidden; dot always visible
- Unit tests: `timeToY()` returns correct values at all three zoom levels for known dates; aggregation groups point events correctly by bucket; aggregation never includes span events; year zoom suppresses all point events.
- Manual verification: flip the hardcoded zoom constant between all three levels and confirm the canvas rescales correctly, year markers reposition, and aggregation behaves as expected on the mock dataset.

### Phase 3 — Interactivity
- Hover state on stations (desktop) and tap state (mobile)
- Click/tap to open detail cards — floating on desktop, bottom sheet on mobile
- All card types rendered (standard, trip, gallery, book, show, milestone)
- S3 image loading with lazy thumbnails and lightbox for originals
- Zoom level toggle — button group on desktop, segmented control on mobile
- Smooth animated zoom transitions
- Line family filter — sidebar on desktop, bottom drawer on mobile
- Integration tests: all card types, zoom switching, mobile bottom sheet, touch targets

### Phase 4 — Live API
- Swap mock JSON for real REST API calls
- Loading states and skeleton UI
- Error handling and empty states
- Birthday auto-generation and explicit override logic
- Unit tests: birthday generation, override merging, API normalization

### Phase 5 — Performance Validation
- Stress test with a full synthesized life dataset (10,000+ events)
- Profile scroll performance, measure frame rate, identify and fix bottlenecks
- Add `?from=&to=` date range windowing to API and frontend if needed
- Confirm S3 image loading does not block scroll performance

### Phase 6 — Map Integration
- MapLibre GL JS embedded in trip and event cards
- Click location pin → see event on interactive map
- Travel events show route/waypoints if coordinates are available

---

## Open Questions

These are not blockers for Phase 1 but should be decided before Phase 2:

1. ~~**Concurrent spans on the same family**~~ — **Resolved.** Concurrent spans are supported. On desktop they render as adjacent sibling lanes. On mobile they collapse into a single bolder line whose weight reflects the active count, with termination stations rendering as each ends.

2. ~~**The spine as an event carrier**~~ — **Resolved.** The spine carries its own point events: birthdays, marriages, relocations, bereavements, and other personal milestones that don't belong to an episodic line. These use `family_id: "spine"` and render as a distinct milestone card type.

3. ~~**Canvas performance**~~ — **Resolved.** Performance is a first-class concern built in from Phase 1, not deferred. See the Performance Strategy and Testing sections below.

4. **Hugo JSON feed** — worth adding the JSON output format to your blog config now even if the timeline doesn't use it yet, so the data is there when you want it.

5. ~~**Photo hosting**~~ — **Resolved.** Photos are hosted in an S3 bucket. Photo URLs in `photos[]` and `hero_image_url` reference S3 directly. See the Photo Hosting section below.

---

*Last updated: planning phase, pre-build. Revised to include framework rationale, mobile design, spine events, concurrent span rendering, birthday auto-generation, S3 photo hosting, performance strategy, testing strategy, nested branching, zoom infrastructure phase, light/dark mode, station labels and icons, branch/merge station placement, and MDI icon system.*
