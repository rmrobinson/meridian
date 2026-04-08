# Metadata-Type Card Rendering Refactor

## Problem

The web-timeline card renderer (`cards.js`) currently dispatches on `event.family_id` to
select a card template. This conflates two independent concerns:

- **Line family** — which visual lane an event is placed on.
- **Metadata type** — what structured data the event carries and therefore what card to render.

These must be decoupled. A flight event reassigned to a travel lane should still render a
flight card. A future event type that shares a family with an existing one should get its own
card without touching lane logic.

The root cause is that the REST API returns `metadata` as an opaque JSON blob with no
type tag. The type was only recoverable by inferring it from `family_id`. This plan fixes
the problem at the correct layer: the type is captured at write time (from the gRPC `oneof`
arm, where it is unambiguous) and stored as a first-class `metadata_type` column in the DB.
Every subsequent reader — REST handler, gRPC read handler, frontend — reads the stored type
directly.

---

## Metadata Type Registry

The canonical mapping between the gRPC `oneof` arm and the stored `metadata_type` string:

| gRPC oneof arm | `metadata_type` value | Backend struct |
|---|---|---|
| `LifeMetadata` | `life` | `domain.LifeMetadata` |
| `EmploymentMetadata` | `employment` | `domain.EmploymentMetadata` |
| `EducationMetadata` | `education` | `domain.EducationMetadata` |
| `TravelMetadata` | `travel` | `domain.TravelMetadata` |
| `FlightMetadata` | `flight` | `domain.FlightMetadata` |
| `BookMetadata` | `book` | `domain.BookMetadata` |
| `FilmTVMetadata` | `film_tv` | `domain.FilmTVMetadata` |
| `ConcertMetadata` | `concert` | `domain.ConcertMetadata` |
| `FitnessMetadata` | `fitness` | `domain.FitnessMetadata` |
| *(none set)* | `""` / omitted | — |

---

## Phase 1 — DB Migration

**File:** `backend/internal/db/migrations/000006_add_metadata_type.up.sql`

```sql
ALTER TABLE events ADD COLUMN metadata_type TEXT;
```

**File:** `backend/internal/db/migrations/000006_add_metadata_type.down.sql`

```sql
ALTER TABLE events DROP COLUMN metadata_type;
```

No data migration is needed — the DB will be recreated from scratch.

---

## Phase 2 — Domain Layer

**File:** `backend/internal/domain/event.go`

Add `MetadataType *string` to the `Event` struct, adjacent to `Metadata`:

```go
Metadata     *string // raw JSON
MetadataType *string // e.g. "life", "flight", "fitness"; nil when no metadata
```

---

## Phase 3 — DB Layer

**File:** `backend/internal/db/events.go`

### 3.1 `CreateEvent`

Add `metadata_type` to the column list and `e.MetadataType` to the values list.

### 3.2 `UpdateEvent`

Add `metadata_type = ?` to the SET clause and `e.MetadataType` to the args list.

### 3.3 All SELECT queries

Add `metadata_type` to the SELECT column list in `GetEventByID`, `ListEvents`,
`GetEventBySourceID`, and `GetEventWithLinked`. All four delegate to `scanEvent`, so the
change is centralised there.

### 3.4 `scanEvent`

Add a `metadataType sql.NullString` scan variable. After scanning, if `metadataType.Valid`,
set `e.MetadataType = &metadataType.String`.

---

## Phase 4 — gRPC Mapping

**File:** `backend/internal/api/grpc/mapping.go`

### 4.1 `extractCreateMetadata` and `extractUpdateMetadata`

Change both functions to return `(json *string, metadataType string)` instead of `*string`.
Add the type string as the second return value, derived from the `oneof` arm:

```go
case *pb.CreateEventRequest_LifeMetadata:
    return marshalMetadata(...), "life"
case *pb.CreateEventRequest_FlightMetadata:
    return marshalMetadata(...), "flight"
// ... etc.
```

Return `nil, ""` for the nil/default case.

### 4.2 gRPC handler callsites

**File:** `backend/internal/api/grpc/timeline.go`

In `CreateEvent` and `UpdateEvent` handlers, unpack the new two-value return and set both
`e.Metadata` and `e.MetadataType` on the domain event before writing to the DB.

### 4.3 `jsonToEventMetadata`

Change the switch discriminator from `e.FamilyID` to `*e.MetadataType` (with a nil guard).
This fixes the gRPC read path to be independent of family as well.

```go
func jsonToEventMetadata(e *domain.Event, out *pb.Event) {
    if e.Metadata == nil || *e.Metadata == "" || e.MetadataType == nil {
        return
    }
    switch *e.MetadataType {
    case "life":       // parse domain.LifeMetadata → pb.LifeMetadata
    case "employment": // ...
    // etc.
    }
}
```

---

## Phase 5 — REST API

**File:** `backend/internal/api/rest/events.go`

### 5.1 `eventResponse` struct

Add:

```go
MetadataType string `json:"metadata_type,omitempty"`
```

### 5.2 `toEventResponse`

Populate it directly from the domain field — no logic required:

```go
if e.MetadataType != nil {
    resp.MetadataType = *e.MetadataType
}
```

---

## Phase 6 — Frontend: `api.js`

**File:** `web-timeline/app/js/api.js`

### 6.1 `normalizeEvent`

Add `metadata_type: evt.metadata_type ?? null` to the returned object. No mapping logic.

### 6.2 `resolveFlights`

No changes needed. The spread `{ ...evt, family_id: ..., line_key: ..., icon }` already
carries `metadata_type` through unchanged. A flight reassigned to a travel lane retains
`metadata_type: 'flight'`.

### 6.3 `generateBirthdays`

Auto-generated birthday events are constructed as a literal object outside `normalizeEvent`.
Add `metadata_type: 'life'` explicitly to that object.

### 6.4 Mock fixture

The Glastonbury event (`family_id: 'hobbies'`, currently `metadata: { activity: 'concert' }`)
lacks `metadata_type` in the JSON. Update the fixture to add `"metadata_type": "concert"` and
replace the freeform metadata with structured `ConcertMetadata` fields (`main_act`,
`opening_acts`, `venue`) so that it exercises `concertCard`.

---

## Phase 7 — Frontend: `cards.js`

**File:** `web-timeline/app/js/cards.js`

### 7.1 Replace dispatch with a switch on `metadata_type`

```js
export function buildCardContent(event) {
  if (event.type === 'aggregate') return aggregateCard(event);
  switch (event.metadata_type) {
    case 'life':       return milestoneCard(event);
    case 'employment': return employmentCard(event);
    case 'education':  return educationCard(event);
    case 'travel':     return travelCard(event);
    case 'flight':     return flightCard(event);
    case 'book':       return bookCard(event);
    case 'film_tv':    return filmTvCard(event);
    case 'fitness':    return fitnessCard(event);
    case 'concert':    return concertCard(event);
    default:           return standardCard(event);
  }
}
```

### 7.2 Updated existing builders

| Builder | Change |
|---|---|
| `milestoneCard` | No logic change. |
| `bookCard` | Add `cover_image_url` as `<img class="card-book-cover">` if present. |
| `showCard` → `filmTvCard` | Rename function. Add `poster_url` image. Branch on `metadata.type`: `'movie'` shows `director` + `year`; `'tv'` shows `network` + `seasons_watched`. CSS class stays `card--tv`. |
| `tripCard` | **Deleted.** Replaced by `travelCard`. |
| `galleryCard` | **Deleted.** Gallery section is now part of `travelCard` and `concertCard`. |

### 7.3 New `travelCard` (class `card--travel`)

Absorbs `tripCard` and `galleryCard`. Rendering order:

1. Hero image — `<img class="card-hero">` if `hero_image_url` is set (lazy).
2. `appendShared()` — title, dates, description, location.
3. Metadata — `countries` joined by ` · ` as `<p class="card-countries">`; same for `cities`.
4. Gallery — if `photos.length > 0`, `<div class="card-gallery">` with one lazy `<img>` each.
5. Read-more link — `<a class="card-read-more">` if `external_url` is set.

### 7.4 New `employmentCard` (class `card--employment`)

`appendShared` + `role` as `<p class="card-role">` + company name as `<a class="card-company">`
(linked) if `company_url` is set, plain `<p>` otherwise.

### 7.5 New `educationCard` (class `card--education`)

`appendShared` + `<p class="card-institution">` + `<p class="card-degree">`.

### 7.6 New `flightCard` (class `card--flight`)

`appendShared` + route line `<p class="card-route">ORIGIN → DESTINATION</p>` if both IATA
codes are present + `airline`, `flight_number`, `aircraft_type` each as their own `<p>` +
schedule section showing scheduled/actual departure and arrival using new `formatTime(isoStr)`
helper (returns `HH:MM` via `toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })`).

### 7.7 New `fitnessCard` (class `card--fitness`)

`appendShared` + common stats section (any of: `duration`, `distance_km` as `"42.2 km"`,
`elevation_gain_m` as `"+420 m"`, `avg_heart_rate` as `"142 bpm"`) + activity sub-section
switching on `metadata.activity`:

| `activity` | Extra fields rendered |
|---|---|
| `run` | `avg_pace_min_km` as `"M:SS /km"` via `formatPace()` helper |
| `cycle` | `bike`, `avg_speed_kmh` |
| `hike` | `trail_name`, `alltrails_url` as a link |
| `ski` | `resort`, `vertical_drop_m`, `runs` |
| `scuba` | `dive_site`, `max_depth_m` |
| `climb` | `climbing_type`, `grade`, `route_name` or `problem_name` |
| `golf` | `course_name`, `holes`, `score` |
| `squash` | `opponent`, `result` |

\+ Garmin link `<a class="card-garmin">` if `garmin_activity_url` is set.

New helpers:
```js
function formatPace(decimalMinutes) // → "M:SS /km"
function formatTime(isoString)      // → "HH:MM"
```

### 7.8 New `concertCard` (class `card--concert`)

`appendShared` + `<p class="card-main-act">` + opening acts joined by ` · ` +
`<p class="card-venue">` from `metadata.venue.label` + gallery section (same as `travelCard`)
+ `<a class="card-playlist">` if `playlist_url` is set.

---

## Phase 8 — Tests

### 8.1 Backend: REST handler test

**File:** `backend/internal/api/rest/server_test.go` (or adjacent)

Add a test asserting that an event with a known `MetadataType` (e.g. `"flight"`) returns
`metadata_type: "flight"` in the REST response JSON. One test per metadata type is ideal;
at minimum one test covering the field presence and one covering the omitempty (no metadata).

### 8.2 Backend: gRPC integration test

**File:** `backend/internal/api/grpc/grpc_test.go`

Add assertions to the existing `TestEventCRUD`-style tests verifying that `MetadataType` is
populated on the domain event after create and survives a round-trip read.

### 8.3 Frontend: `api.test.js`

Add `describe('metadata_type passthrough')` block:
- `normalizeEvent` with `metadata_type: 'flight'` in the raw payload → `evt.metadata_type === 'flight'`.
- `resolveFlights` preserves `metadata_type: 'flight'` after reassigning `family_id` to `'travel'`.
- `generateBirthdays` output has `metadata_type: 'life'`.
- Unknown `metadata_type` passes through unchanged.

### 8.4 Frontend: `cards.test.js`

**Update `base()` helper:** add `metadata_type: 'standard'` as the default.

**Update existing dispatch tests:** replace `family_id`-driven assertions with
`metadata_type`-driven ones (e.g. `metadata_type: 'life'` instead of `family_id: 'spine'`).
Remove the standalone `gallery card` dispatch test (gallery is now a section, not a card type).

**Add new `describe` blocks** for each new card builder:

| Suite | Key tests |
|---|---|
| `travel card` | hero image, countries, cities, gallery section, read-more link, all-absent case |
| `flight card` | route line (IATA codes), airline, flight number, absent IATA omits route |
| `employment card` | role, company as link, company as plain text when no URL |
| `education card` | institution, degree |
| `fitness card` | common stats (distance, pace, elevation, HR), one test per activity sub-section, Garmin link |
| `concert card` | main act, opening acts, venue, playlist link, absent opening acts |
| `film_tv card` | poster image, movie branch (director + year, no seasons), tv branch (network + seasons, no director) |

---

## Phase 9 — Developer Guide

**File:** `web-timeline/docs/adding-card-types.md`

Content outline:

1. **Overview** — Cards dispatch on `event.metadata_type`, not `event.family_id`. Family
   controls lane placement; metadata type controls card rendering. They are independent.

2. **Step 1 — Define the backend metadata struct** — Add `XxxMetadata` to
   `backend/internal/domain/metadata.go` with snake_case JSON tags.

3. **Step 2 — Add proto message and oneof arm** — Add the message to `timeline.proto` and
   register it in all three `oneof metadata` blocks (`Event`, `CreateEventRequest`,
   `UpdateEventRequest`). Run `./generate.sh`. Add proto↔domain conversion in `mapping.go`.

4. **Step 3 — Register `metadata_type` in `extractCreateMetadata` / `extractUpdateMetadata`**
   — Add a `case` for the new oneof arm returning the JSON + the new type string (e.g.
   `"concert"`). This is the single point where the type is captured.

5. **Step 4 — Verify `jsonToEventMetadata` handles the new type** — Add a `case` in the
   switch so the gRPC read path returns typed metadata.

6. **Step 5 — The REST API requires no logic changes** — `metadata_type` flows through
   `toEventResponse` automatically from the domain field.

7. **Step 6 — Add `metadata_type` to the mock fixture** — Add a sample event with
   `"metadata_type": "your_type"` and realistic metadata fields to
   `web-timeline/app/tests/fixtures/mock-timeline.json`.

8. **Step 7 — Write the card builder in `cards.js`** — Create `function myNewCard(event)`,
   start with `el('div', 'card--new-type')`, call `appendShared()`, then add metadata-specific
   elements. Reference `employmentCard` for simple cases; `fitnessCard` for activity-
   discriminated sub-sections.

9. **Step 8 — Register in `buildCardContent()`** — Add `case 'new_type': return myNewCard(event);`
   to the switch. The `aggregate` guard at the top is never displaced.

10. **Step 9 — Update `FAMILY_LABELS`** if the family is new (used only by the week card).

11. **Step 10 — Write tests** — Dispatch test (CSS class), one test per metadata field
    rendered, one test per optional-field-absent case, and one `api.test.js` test verifying
    `metadata_type` passes through `normalizeEvent` unchanged.

12. **Reference table** — Full registry of all current `metadata_type` values, source gRPC
    oneof arm, backend struct, and `cards.js` builder function. Keep in sync when adding types.

---

## Implementation Order

1. Phase 1 — migration SQL files
2. Phase 2 — `domain.Event` field
3. Phase 3 — DB layer (`events.go`)
4. Phase 4 — gRPC mapping + handler (`mapping.go`, `timeline.go`)
5. Phase 5 — REST API (`rest/events.go`)
6. Phase 6 — `api.js`
7. Phase 7 — `cards.js`
8. Phase 8 — tests (backend then frontend)
9. Phase 9 — developer guide

Phases 1–5 are a single backend PR concern. Phases 6–9 are frontend. Both can be reviewed
independently but must ship together since the frontend depends on the new REST field.
