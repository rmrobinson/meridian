# Meridian — Backend Architecture

## Overview

The backend is a single Go binary exposing two servers:

- **REST API** — public read access, served via `net/http`
- **gRPC API** — protected write access, bearer token authenticated

Storage is SQLite. Line family definitions are loaded from a YAML config file at startup and served from memory. Source priority for event merging is also defined in config.

The backend lives in the `backend/` directory of the `rmrobinson/meridian` monorepo. Proto files are defined at the monorepo root in `proto/` and generated output is written to `backend/gen/go/`.

---

## Repository Structure

Paths are relative to the monorepo root.

```
/proto
  timeline.proto          — gRPC service and message definitions

/backend
  /gen
    /go
      timeline.pb.go        — generated protobuf types (gitignored, generated at build time)
      timeline_grpc.pb.go   — generated gRPC service stubs (gitignored, generated at build time)

  /cmd
    /server
      main.go               — entry point; wires config, db, auth, REST and gRPC servers

  /internal
    /api
      /rest
        server.go           — net/http server setup, middleware, route registration
        timeline.go         — GET /api/timeline handler
        events.go           — GET /api/events, GET /api/events/:id handlers
        lines.go            — GET /api/lines handler
        middleware.go       — JWT parsing, visibility scoping
        jwt.go              — JWT validation, role extraction, RoleToVisibility
      /grpc
        server.go           — gRPC server setup, bearer token auth interceptor
        timeline.go         — CreateEvent, UpdateEvent, DeleteEvent, ImportEvents
        photos.go           — AddPhoto, RemovePhoto, ReorderPhotos
        merge.go            — MergeEvents, UnmergeEvents
    /config
      config.go             — Viper loading, struct definitions
    /db
      db.go                 — SQLite connection, migrations
      events.go             — event queries
      photos.go             — photo queries
    /domain
      event.go              — Event, Photo types; enums
      family.go             — LineFamily type
    /merge
      merger.go             — coalescing logic, source priority resolution
    /auth
      tokens.go             — bearer token bcrypt validation for gRPC write path
    /enrichment
      isbndb.go             — ISBNdb metadata fetcher
      tmdb.go               — TMDB metadata fetcher
      s3.go                 — S3 image uploader
```

---

## Configuration

Single YAML file loaded via Viper at startup.

```yaml
server:
  rest_port: 8080
  grpc_port: 9090

database:
  path: ./timeline.db

auth:
  jwt_secret: "..."         # used by REST read path to validate scoped JWTs
  write_tokens:             # used by gRPC write path; bcrypt hashes of raw bearer tokens
    - name: "cli"
      token_hash: "$2a$10$..."
    - name: "ios-app"
      token_hash: "$2a$10$..."
    - name: "import-service"
      token_hash: "$2a$10$..."

person:
  name: "Your Name"
  birth_date: "1990-04-12"

line_families:
  - id: spine
    label: Life Spine
    base_color_hsl: [0, 0, 80]
    side: center
    on_end: never
    spawn_behavior: single_line

  - id: employment
    label: Employment
    base_color_hsl: [210, 70, 50]
    side: left
    on_end: merge
    spawn_behavior: per_event

  - id: education
    label: Education
    base_color_hsl: [270, 60, 55]
    side: left
    on_end: merge
    spawn_behavior: per_event

  - id: hobbies
    label: Hobbies
    base_color_hsl: [180, 55, 45]
    side: left
    on_end: terminate
    spawn_behavior: per_event

  - id: travel
    label: Travel
    base_color_hsl: [50, 85, 50]
    side: right
    on_end: merge
    spawn_behavior: per_event

  - id: flights
    label: Flights
    base_color_hsl: [200, 75, 50]
    side: right
    on_end: terminate
    spawn_behavior: per_event

  - id: books
    label: Books
    base_color_hsl: [30, 70, 50]
    side: right
    on_end: terminate
    spawn_behavior: per_event

  - id: film_tv
    label: Film & TV
    base_color_hsl: [300, 60, 55]
    side: right
    on_end: terminate
    spawn_behavior: per_event

  - id: fitness
    label: Fitness & Health
    base_color_hsl: [140, 65, 45]
    side: right
    on_end: terminate
    spawn_behavior: single_line

source_priority:
  # Earlier = higher priority. manual is always highest regardless of position.
  sources:
    - manual
    - garmin
    - alltrails
    - strava
    - google_fit
```

---

## Storage Schema

```sql
CREATE TABLE events (
    id              TEXT PRIMARY KEY,
    family_id       TEXT NOT NULL,
    line_key        TEXT NOT NULL,
    parent_line_key TEXT,
    type            TEXT NOT NULL CHECK(type IN ('span', 'point')),
    title           TEXT NOT NULL,
    label           TEXT,
    icon            TEXT,
    date            TEXT,             -- ISO 8601, used when type = 'point'
    start_date      TEXT,             -- used when type = 'span'
    end_date        TEXT,             -- nullable; open-ended spans have no end date
    location_label  TEXT,
    location_lat    REAL,
    location_lng    REAL,
    external_url    TEXT,
    hero_image_url  TEXT,
    metadata        TEXT,             -- JSON; schema varies by family_id
    visibility      TEXT NOT NULL DEFAULT 'personal'
                        CHECK(visibility IN ('public', 'friends', 'family', 'personal')),
    source_service  TEXT,             -- null for manual events
    source_event_id TEXT,             -- ID in the originating system; null for manual events
    canonical_id    TEXT REFERENCES events(id),  -- null = this row is canonical
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT              -- soft delete; null = active
);

CREATE TABLE photos (
    id         TEXT PRIMARY KEY,
    event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    s3_url     TEXT NOT NULL,
    variant    TEXT NOT NULL CHECK(variant IN ('hero', 'thumb', 'original')),
    sort_order INTEGER NOT NULL DEFAULT 0
);
```

### ID Strategy

Event IDs are caller-provided slugs (e.g. `japan-2023`, `acme-corp`) or service-generated nanoids when none is supplied. The gRPC `CreateEvent` request accepts an optional `id` field — if absent the service generates a nanoid.

`source_event_id` is the ID assigned by the originating external service (e.g. Garmin activity ID, AllTrails hike ID). It is used during import to detect whether an event has already been imported from that source, enabling upsert behaviour without ID collisions.

---

## REST API

Public read endpoints. Unauthenticated requests see only `visibility = 'public'` events. A valid JWT encodes a role which determines the visibility levels accessible:

| Role | Visible levels |
|---|---|
| unauthenticated | public |
| friends | public, friends |
| family | public, friends, family |
| owner | public, friends, family, personal |

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/timeline` | Full response — person, families, all accessible events with photos |
| `GET` | `/api/events` | Filtered events (`?family=travel&from=2020-01-01&to=2021-01-01`) |
| `GET` | `/api/events/:id` | Single event with photos |
| `GET` | `/api/lines` | All line family definitions |

---

## gRPC API

Protected by a bearer token auth interceptor. Callers supply `Authorization: Bearer <token>` in gRPC metadata. The interceptor bcrypt-compares the raw token against all configured `write_tokens` hashes — first match wins. The matched token `name` is logged for auditability; the raw token is never logged. Unmatched or missing tokens return `codes.Unauthenticated`.

Raw tokens are generated out of band (e.g. `openssl rand -hex 32`), bcrypt-hashed, and stored in config. Multiple named tokens allow individual callers (CLI, mobile app, import service) to be revoked independently.

```protobuf
syntax = "proto3";
package timeline;

service TimelineService {
    rpc CreateEvent(CreateEventRequest) returns (Event);
    rpc UpdateEvent(UpdateEventRequest) returns (Event);
    rpc DeleteEvent(DeleteEventRequest) returns (DeleteEventResponse);
    rpc ImportEvents(ImportEventsRequest) returns (ImportEventsResponse);

    rpc AddPhoto(AddPhotoRequest) returns (Photo);
    rpc RemovePhoto(RemovePhotoRequest) returns (RemovePhotoResponse);
    rpc ReorderPhotos(ReorderPhotosRequest) returns (Event);

    rpc MergeEvents(MergeEventsRequest) returns (Event);
    rpc UnmergeEvent(UnmergeEventRequest) returns (Event);
}

enum ConflictStrategy {
    CONFLICT_STRATEGY_UNSPECIFIED = 0;
    CONFLICT_STRATEGY_UPSERT = 1;
    CONFLICT_STRATEGY_SKIP = 2;
}

message ImportEventsRequest {
    repeated CreateEventRequest events = 1;
    ConflictStrategy conflict_strategy = 2;
    string source_service = 3;   // e.g. "garmin", "strava", "alltrails"
}

message ImportEventsResponse {
    int32 created = 1;
    int32 updated = 2;
    int32 skipped = 3;
    int32 failed  = 4;
    repeated string errors = 5;  // human-readable; not per-event
}
```

### CreateEvent / UpdateEvent notes

- `UpdateEvent` uses full replacement (PUT semantics) — the client supplies the complete event object. This simplifies field removal.
- `DeleteEvent` is a soft delete only. Hard deletes are a database-level operation.
- At creation time, events in the `books` and `film_tv` families trigger a side effect: the service queries ISBNdb (books) or TMDB (film/tv) to fetch metadata and copy the cover/poster image to S3. The stored `hero_image_url` and metadata fields reference S3, not the external service.

### ImportEvents notes

- `source_service` is set at the request level, not per event — all events in a single import call share the same source.
- Auto-merge runs at import time: if an incoming event matches an existing canonical event by date + activity type, the service links the new row as non-canonical and resolves field values by source priority.
- Merge results are not included in `ImportEventsResponse` — the summary stays high-level.

### MergeEvents / UnmergeEvent notes

- `MergeEvents` takes a canonical event ID and one or more event IDs to link to it, setting `canonical_id` on the linked rows.
- `UnmergeEvent` detaches a linked event back to standalone canonical by clearing its `canonical_id`.
- Manual merges override auto-merge decisions.

---

## Event Merging

When two or more rows describe the same real-world event (e.g. the same run imported from both Garmin and Strava), one row is designated canonical (`canonical_id IS NULL`) and the others are linked to it (`canonical_id = <canonical row id>`).

The REST read path returns only canonical rows. Field values are resolved by merging all linked rows according to source priority defined in config, with `manual` always highest regardless of config order.

**Merge identity:** two events are candidates for auto-merge if they share the same `date` (or overlapping `start_date`/`end_date`) and the same `activity` value in metadata. The service applies this check at import time and flags candidates automatically.

**Field resolution:** for each field, the value from the highest-priority source that has a non-null value wins. This means a manually entered `title` is preserved even if Garmin provides a different one, while Garmin's `distance_km` fills in a field left null on the manual entry.

---

## Metadata Schemas by Family

All metadata is stored as JSON in the `metadata` column. Schemas by `family_id`:

### spine
```json
{
  "milestone_type": "relocation",
  "from": "Edinburgh, UK",
  "to": "London, UK"
}
```
`milestone_type` options: `birthday`, `marriage`, `relocation`, `bereavement`, `other`

### employment
```json
{
  "role": "Senior Engineer",
  "company_name": "Acme Corp",
  "company_url": "https://acme.com"
}
```
`company_url` and `company_name` are nullable (company may no longer exist).

### education
```json
{
  "institution": "MIT",
  "degree": "BSc Computer Science"
}
```

### travel
```json
{
  "countries": ["Japan"],
  "cities": ["Tokyo", "Kyoto"]
}
```

### flights
```json
{
  "airline": "British Airways",
  "flight_number": "BA142",
  "aircraft_type": "Boeing 777",
  "tail_number": "G-VIIA",
  "origin_iata": "LHR",
  "destination_iata": "NRT",
  "scheduled_departure": "2023-03-10T09:00:00Z",
  "scheduled_arrival": "2023-03-10T22:30:00Z",
  "actual_departure": "2023-03-10T09:14:00Z",
  "actual_arrival": "2023-03-10T22:18:00Z"
}
```
Flights are always point events (keyed on departure date). They may be linked to a travel span via `parent_line_key` or standalone for work/relocation travel. All times are UTC.

### books
```json
{
  "isbn": "9780441013593",
  "author": "Frank Herbert",
  "cover_image_url": "https://s3.../timeline/events/dune-2022/cover.jpg",
  "preview_url": "https://isbndb.com/...",
  "rating": 5,
  "review": "Incredible world-building and political depth."
}
```
`cover_image_url` references S3 — fetched from ISBNdb and copied to S3 at creation time.

### film_tv
```json
{
  "tmdb_id": "238",
  "type": "movie",
  "poster_url": "https://s3.../timeline/events/godfather-1972/poster.jpg",
  "director": "Francis Ford Coppola",
  "network": null,
  "year": 1972,
  "seasons_watched": null,
  "rating": 5,
  "review": "..."
}
```
`type` is `movie` or `tv`. `network` and `seasons_watched` are used for TV only. `poster_url` references S3 — fetched from TMDB and copied to S3 at creation time.

### fitness

All fitness events share a common set of fields plus activity-specific additions.

**Common fields (all activities):**
```json
{
  "activity": "run",
  "duration": "3:47:00",
  "distance_km": 42.2,
  "elevation_gain_m": 120,
  "avg_heart_rate": 152,
  "garmin_activity_url": "https://connect.garmin.com/activity/..."
}
```
`garmin_activity_url` is null for manually entered activities. `distance_km` and `elevation_gain_m` are null where not applicable (e.g. squash).

**Running** — adds:
```json
{
  "avg_pace_min_km": 5.4
}
```

**Cycling** — adds:
```json
{
  "bike": "Trek Domane",
  "avg_speed_kmh": 28.3
}
```

**Hiking** — adds:
```json
{
  "trail_name": "Ben Nevis",
  "alltrails_url": "https://alltrails.com/..."
}
```

**Skiing** — adds:
```json
{
  "resort": "Whistler",
  "vertical_drop_m": 5020,
  "runs": 18
}
```

**Scuba** — adds:
```json
{
  "dive_site": "Great Barrier Reef",
  "max_depth_m": 28,
  "avg_depth_m": 14
}
```

**Climbing** — adds:
```json
{
  "climbing_type": "sport"
}
```
`climbing_type` options: `sport`, `bouldering`, `gym`

Sport climbing adds:
```json
{
  "route_name": "Grande Voie",
  "grade": "6c"
}
```

Bouldering adds:
```json
{
  "problem_name": "La Marie Rose",
  "grade": "V4"
}
```

Gym adds nothing beyond `climbing_type`.

**Golf:**
```json
{
  "activity": "golf",
  "course_name": "St Andrews Links",
  "holes": 18,
  "score": 82,
  "duration": "4:15:00"
}
```

**Squash:**
```json
{
  "activity": "squash",
  "opponent": "...",
  "result": "win",
  "duration": "1:00:00"
}
```

### hobbies
```json
{
  "activity": "concert",
  "artist": "Radiohead",
  "venue": "Glastonbury Festival",
  "setlist_url": "https://open.spotify.com/playlist/..."
}
```
`setlist_url` is nullable. `activity` distinguishes concert from other hobby subtypes.

---

## External Service Integrations

### ISBNdb (books)
Queried at `CreateEvent` time for `family_id = "books"`. The service fetches title, author, and cover image by ISBN. The cover image is downloaded and stored in S3. All retrieved fields are written to the `metadata` JSON column. Subsequent reads serve from local storage — no runtime dependency on ISBNdb.

### TMDB (film & TV)
Queried at `CreateEvent` time for `family_id = "film_tv"`. The service fetches title, director/network, year, and poster image by TMDB ID. The poster is downloaded and stored in S3. All retrieved fields are written to `metadata`. Subsequent reads serve from local storage — no runtime dependency on TMDB.

### Garmin Connect
Import source for running, cycling, hiking, skiing, and scuba events. Activities are imported via `ImportEvents` with `source_service: "garmin"`. Auto-merge runs against existing events with matching date and activity type.

### AllTrails
Import source for hiking events. Imported via `ImportEvents` with `source_service: "alltrails"`. Auto-merge candidates are matched against Garmin hike imports by date.

### Strava
Optional import source for running and cycling. Imported via `ImportEvents` with `source_service: "strava"`. Lower priority than Garmin in default config.

---

## Updated Line Family Catalog

| Family | ID | Base Color (HSL) | Side | On End | Spawn Behavior |
|---|---|---|---|---|---|
| Life Spine | `spine` | `[0, 0, 80]` | Center | Never ends | single_line |
| Employment | `employment` | `[210, 70, 50]` | Left | Merge to spine | per_event |
| Education | `education` | `[270, 60, 55]` | Left | Merge to spine | per_event |
| Hobbies | `hobbies` | `[180, 55, 45]` | Left | Terminate | per_event |
| Travel | `travel` | `[50, 85, 50]` | Right | Merge to spine | per_event |
| Flights | `flights` | `[200, 75, 50]` | Right | Terminate | per_event |
| Books | `books` | `[30, 70, 50]` | Right | Terminate | per_event |
| Film & TV | `film_tv` | `[300, 60, 55]` | Right | Terminate | per_event |
| Fitness & Health | `fitness` | `[140, 65, 45]` | Right | Terminate | single_line |
