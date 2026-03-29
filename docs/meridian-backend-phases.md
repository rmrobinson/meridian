# Meridian — Backend Implementation Phases

Each phase is self-contained and leaves the codebase in a working, tested state. Phases build strictly on the previous one — do not start a phase until all tests from the prior phase pass.

The full architecture reference is in `meridian-backend.md`. All paths below are relative to the `backend/` directory of the `rmrobinson/meridian` monorepo unless stated otherwise.

---

## Phase 1 — Project Skeleton & Configuration

**Goal:** Establish the module structure and config loading within `backend/`. No database, no servers yet. At the end of this phase the binary starts, loads config, and exits cleanly.

### Tasks

- Initialise Go module (`go.mod`) in `backend/`
- Create the directory structure within `backend/`:
  ```
  gen/go/               — gitignored; populated by buf generate at build time
  cmd/server/
  internal/api/rest/
  internal/api/grpc/
  internal/config/
  internal/db/
  internal/domain/
  internal/merge/
  internal/auth/
  internal/enrichment/
  ```
- Confirm `proto/timeline.proto` exists at the monorepo root (created as part of monorepo scaffold); do not recreate it here
- Implement `internal/config/config.go`:
  - Struct definitions for all config fields: `Server`, `Database`, `Auth`, `Person`, `LineFamily`, `SourcePriority`
  - `Auth` struct contains:
    - `JWTSecret string` — used by the REST read path to validate scoped JWTs
    - `WriteTokens []WriteToken` — list of named bcrypt-hashed bearer tokens for gRPC write access
  - `WriteToken` struct: `Name string`, `TokenHash string`
  - Load from YAML via Viper
  - Validate required fields on load: missing `jwt_secret`, `database.path`, or `person.birth_date` are fatal errors; zero `write_tokens` entries is a fatal error
- Write a sample `config.yaml` in `backend/` with all 9 line families, the default source priority order, and example `write_tokens` entries:
  ```yaml
  auth:
    jwt_secret: "..."
    write_tokens:
      - name: "cli"
        token_hash: "$2a$10$..."
      - name: "ios-app"
        token_hash: "$2a$10$..."
  ```
- Implement `cmd/server/main.go` — loads config, logs summary of loaded families and configured write token names (never the hashes), exits

### Unit Tests (`internal/config`)

- Valid config file loads without error
- All 9 line families are parsed correctly with correct HSL values, side, on_end, and spawn_behavior
- Source priority list is loaded in order
- Multiple write tokens are parsed with correct names and hashes
- Missing `jwt_secret` returns a validation error
- Missing `person.birth_date` returns a validation error
- Empty `write_tokens` list returns a validation error
- Malformed YAML returns a parse error

---

## Phase 2 — Domain Types & Storage

**Goal:** Define all domain types and implement the SQLite schema with migrations. No API yet. At the end of this phase the binary starts, runs migrations, and exits cleanly.

### Tasks

- Implement `internal/domain/event.go`:
  - `Event` struct with all fields matching the schema
  - `Photo` struct
  - Enums: `EventType` (span/point), `Visibility` (public/friends/family/personal), `ConflictStrategy` (upsert/skip)
- Implement `internal/domain/family.go`:
  - `LineFamily` struct
  - Enums: `Side` (left/right/center), `OnEnd` (merge/terminate/never), `SpawnBehavior` (per_event/single_line)
- Implement `internal/db/db.go`:
  - Open SQLite connection using `modernc.org/sqlite` (pure Go, no CGo)
  - Run migrations on startup — apply schema if tables do not exist
  - Schema exactly as defined in the architecture doc, including all CHECK constraints
- Implement `internal/db/events.go` — CRUD operations:
  - `CreateEvent(ctx, event) error`
  - `GetEventByID(ctx, id) (*Event, error)` — excludes soft-deleted rows
  - `ListEvents(ctx, filter) ([]*Event, error)` — filter struct supports family_id, from/to dates, visibility levels; excludes soft-deleted and non-canonical rows
  - `UpdateEvent(ctx, event) error` — full replacement, updates `updated_at`
  - `SoftDeleteEvent(ctx, id) error` — sets `deleted_at`
  - `GetEventWithLinked(ctx, id) (*Event, []*Event, error)` — returns canonical event plus all linked non-canonical rows
- Implement `internal/db/photos.go`:
  - `AddPhoto(ctx, photo) error`
  - `RemovePhoto(ctx, id) error`
  - `ListPhotosForEvent(ctx, eventID) ([]*Photo, error)`
  - `ReorderPhotos(ctx, eventID, orderedIDs []string) error`
- Wire `db.Open()` into `main.go`

### Unit Tests (`internal/db`)

All db tests use an in-memory SQLite instance (`file::memory:?cache=shared`).

**events.go:**
- `CreateEvent` inserts a row and `GetEventByID` returns it with all fields intact
- `GetEventByID` returns not-found error for a soft-deleted row
- `GetEventByID` returns not-found error for an unknown ID
- `ListEvents` excludes soft-deleted rows
- `ListEvents` excludes non-canonical rows (where `canonical_id IS NOT NULL`)
- `ListEvents` filters correctly by `family_id`
- `ListEvents` filters correctly by `from` date (inclusive)
- `ListEvents` filters correctly by `to` date (inclusive)
- `ListEvents` filters by single visibility level
- `ListEvents` filters by multiple visibility levels
- `UpdateEvent` replaces all fields and updates `updated_at`
- `SoftDeleteEvent` sets `deleted_at` and excludes the row from subsequent `ListEvents`
- `GetEventWithLinked` returns canonical event and all linked rows
- `GetEventWithLinked` returns empty linked slice when no rows are linked

**photos.go:**
- `AddPhoto` inserts a photo linked to a valid event
- `RemovePhoto` deletes the photo row
- `ListPhotosForEvent` returns photos in `sort_order` order
- `ReorderPhotos` updates `sort_order` values correctly
- `AddPhoto` with unknown `event_id` returns a foreign key error

---

## Phase 3 — REST API (Read Endpoints)

**Goal:** Implement all four REST read endpoints with visibility scoping. At the end of this phase the REST server is running and all read endpoints return correct data with correct visibility filtering.

### Tasks

- Implement `internal/api/rest/jwt.go`:
  - `ValidateToken(tokenString, secret) (*Claims, error)` — returns claims including `role`
  - `RoleToVisibility(role string) []Visibility` — maps role to the set of visible levels:
    - unauthenticated → `[public]`
    - friends → `[public, friends]`
    - family → `[public, friends, family]`
    - owner → `[public, friends, family, personal]`
- Implement `internal/api/rest/middleware.go`:
  - JWT middleware: extracts `Authorization: Bearer <token>` header, validates, attaches claims to request context. Requests with no token proceed as unauthenticated — this is not an error on read endpoints.
- Implement `internal/api/rest/server.go`:
  - `net/http` server setup
  - Route registration for all four endpoints
  - Attach JWT middleware to all routes
- Implement `internal/api/rest/lines.go`:
  - `GET /api/lines` — returns all line families from config (no DB query needed)
- Implement `internal/api/rest/events.go`:
  - `GET /api/events` — calls `db.ListEvents` with visibility from request context and any query params (`?family=`, `?from=`, `?to=`)
  - `GET /api/events/:id` — calls `db.GetEventByID`, checks visibility, attaches photos
- Implement `internal/api/rest/timeline.go`:
  - `GET /api/timeline` — returns person (from config), line families (from config), and all accessible events with photos

### Unit Tests (`internal/api/rest` — jwt.go)

- Valid JWT with role `owner` returns correct claims
- Valid JWT with role `friends` returns correct claims
- Expired JWT returns error
- Tampered JWT returns error
- `RoleToVisibility("owner")` returns all four levels
- `RoleToVisibility("family")` returns public, friends, family
- `RoleToVisibility("friends")` returns public, friends
- `RoleToVisibility("")` returns public only

### API Tests (`internal/api/rest`)

API tests start an in-process `httptest.Server` with an in-memory SQLite database seeded with fixture events covering all visibility levels and families.

**GET /api/lines:**
- Returns all 9 families with correct fields
- Response is 200 with correct Content-Type

**GET /api/events:**
- Unauthenticated request returns only `public` events
- `friends` JWT returns public + friends events
- `family` JWT returns public + friends + family events
- `owner` JWT returns all events including personal
- `?family=travel` filters to travel events only
- `?from=2020-01-01` excludes events before that date
- `?to=2022-12-31` excludes events after that date
- `?from` and `?to` combined return only events in range
- Soft-deleted events are never returned
- Non-canonical events are never returned

**GET /api/events/:id:**
- Returns correct event with photos attached
- Returns 404 for unknown ID
- Returns 404 for soft-deleted event
- Returns 403 when event visibility exceeds caller's role (e.g. personal event, unauthenticated caller)
- Photos are returned in sort_order order

**GET /api/timeline:**
- Returns person fields from config
- Returns all 9 line families
- Returns events filtered by caller visibility
- Each event includes its photos

---

## Phase 4 — gRPC API (Core Write Operations)

**Goal:** Implement `CreateEvent`, `UpdateEvent`, `DeleteEvent`, and the photo management RPCs. No import or merge yet. At the end of this phase the gRPC server is running and basic event lifecycle works end-to-end.

### Tasks

- Define `proto/timeline.proto` at the monorepo root (the file may already be scaffolded — extend it with full message and service definitions):
  - All message types: `Event`, `Photo`, `Location`, `CreateEventRequest`, `UpdateEventRequest`, `DeleteEventRequest`, `DeleteEventResponse`, `AddPhotoRequest`, `RemovePhotoRequest`, `RemovePhotoResponse`, `ReorderPhotosRequest`
  - `ConflictStrategy` enum
  - Stub out `ImportEventsRequest`/`ImportEventsResponse` and `MergeEventsRequest`/`UnmergeEventRequest` — defined but not implemented until later phases
  - Service definition with all RPCs
- Run `buf generate` from the monorepo root to generate Go stubs into `backend/gen/go/`
- Implement `internal/api/grpc/server.go`:
  - gRPC server setup on configured port
  - Bearer token auth interceptor — extracts `Authorization: Bearer <token>` from incoming metadata, bcrypt-compares against all configured `write_tokens`, returns `codes.Unauthenticated` if no match. Logs the matched token `name` on success; never logs the raw token.
- Implement `internal/api/grpc/timeline.go`:
  - `CreateEvent` — validates request, generates nanoid if no ID supplied, inserts via `db.CreateEvent`, returns created event
  - `UpdateEvent` — validates request, full replacement via `db.UpdateEvent`, returns updated event
  - `DeleteEvent` — soft deletes via `db.SoftDeleteEvent`, returns empty response
- Implement `internal/api/grpc/photos.go`:
  - `AddPhoto` — inserts photo record, appends to end of sort order
  - `RemovePhoto` — deletes photo record
  - `ReorderPhotos` — validates all IDs belong to the event, calls `db.ReorderPhotos`
- Wire gRPC server into `main.go` alongside REST server, both started concurrently

### Unit Tests (`internal/auth`)

**Bearer token (gRPC write path):**
- Valid raw token matching a configured hash returns the token name
- Valid raw token not matching any configured hash returns error
- Empty token string returns error
- Multiple tokens configured — correct token matched by name

### API Tests (`internal/api/grpc`)

gRPC tests use an in-process server with `bufconn` and an in-memory SQLite database. A valid pre-hashed bearer token is configured for the test server.

**CreateEvent:**
- Creates event with caller-provided ID — returned event has that ID
- Creates event without ID — returned event has a nanoid ID
- Creates span event with `start_date` and `end_date`
- Creates point event with `date`
- Returns `codes.InvalidArgument` when `title` is empty
- Returns `codes.InvalidArgument` when `family_id` is unknown
- Returns `codes.AlreadyExists` when ID is already in use
- Returns `codes.Unauthenticated` when no bearer token provided
- Returns `codes.Unauthenticated` when bearer token does not match any configured hash
- Default visibility is `personal` when not specified

**UpdateEvent:**
- Full replacement — fields not included in request are cleared
- Updates `updated_at` timestamp
- Returns `codes.NotFound` for unknown ID
- Returns `codes.NotFound` for soft-deleted event

**DeleteEvent:**
- Soft deletes event — subsequent `GetEventByID` returns not-found
- Returns `codes.NotFound` for unknown ID
- Returns `codes.NotFound` for already-deleted event

**AddPhoto:**
- Adds photo to event — appears in `ListPhotosForEvent`
- New photo appended at end of sort order
- Returns `codes.NotFound` for unknown event ID

**RemovePhoto:**
- Removes photo — no longer appears in `ListPhotosForEvent`
- Returns `codes.NotFound` for unknown photo ID

**ReorderPhotos:**
- Updates sort order — `ListPhotosForEvent` returns in new order
- Returns `codes.InvalidArgument` when IDs don't all belong to the event
- Returns `codes.InvalidArgument` when not all photo IDs for the event are included

---

## Phase 5 — ImportEvents & Event Merging

**Goal:** Implement `ImportEvents` with conflict resolution, and the auto-merge logic. Implement `MergeEvents` and `UnmergeEvent` for manual control. At the end of this phase the full import and merge lifecycle works.

### Tasks

- Implement `internal/merge/merger.go`:
  - `Merger` struct holding source priority list from config
  - `FindMergeCandidates(ctx, db, incoming *Event) (*Event, error)` — queries for existing canonical events matching date + `metadata.activity`; returns the best match or nil
  - `MergeFields(canonical, linked []*Event, priority []string) *Event` — resolves field values across all rows by source priority; `manual` always wins regardless of position
- Implement `ImportEvents` in `internal/api/grpc/timeline.go`:
  - Process events sequentially
  - For each event: check `source_event_id` + `source_service` for existing row (upsert/skip per `conflict_strategy`)
  - Run `FindMergeCandidates` — if match found, set `canonical_id` on the new row linking it to the existing canonical
  - Accumulate counts: `created`, `updated`, `skipped`, `failed`
  - Collect human-readable errors for failed events; continue processing remaining events
  - Return `ImportEventsResponse` summary
- Implement `MergeEvents` in `internal/api/grpc/merge.go`:
  - Sets `canonical_id` on all specified event IDs pointing to the canonical event ID
  - Returns `codes.NotFound` if canonical ID does not exist
  - Returns `codes.InvalidArgument` if any specified ID does not exist
- Implement `UnmergeEvent` in `internal/api/grpc/merge.go`:
  - Clears `canonical_id` on the specified event, making it standalone canonical
  - Returns `codes.NotFound` if event ID does not exist

### Unit Tests (`internal/merge`)

- `FindMergeCandidates` returns nil when no events exist
- `FindMergeCandidates` returns nil when existing event has different activity type
- `FindMergeCandidates` returns nil when existing event has different date
- `FindMergeCandidates` returns existing canonical event when date and activity match
- `FindMergeCandidates` does not return soft-deleted events
- `FindMergeCandidates` does not return non-canonical events
- `MergeFields` returns `manual` source value when manual and garmin both provide a field
- `MergeFields` falls back to garmin value when manual value is null
- `MergeFields` uses config priority order when neither source is manual
- `MergeFields` handles single event with no linked rows

### API Tests (`internal/api/grpc` — ImportEvents)

- Import 3 new events with `UPSERT` — response: `created=3, updated=0, skipped=0, failed=0`
- Re-import same 3 events with `UPSERT` — response: `created=0, updated=3, skipped=0, failed=0`
- Re-import same 3 events with `SKIP` — response: `created=0, updated=0, skipped=3, failed=0`
- Import batch where one event has empty `title` — that event is counted in `failed`, others are created, errors slice is non-empty
- Import event with date + activity matching existing canonical event — new row is created with `canonical_id` set; `ListEvents` still returns only the canonical row
- `source_service` is stored on all imported events
- `source_event_id` is used to detect re-imports correctly

### API Tests (`internal/api/grpc` — MergeEvents / UnmergeEvent)

- `MergeEvents` sets `canonical_id` on linked events — `ListEvents` returns only canonical
- `MergeEvents` with unknown canonical ID returns `codes.NotFound`
- `MergeEvents` with unknown linked ID returns `codes.InvalidArgument`
- `UnmergeEvent` clears `canonical_id` — event appears independently in `ListEvents`
- `UnmergeEvent` with unknown ID returns `codes.NotFound`

---

## Phase 6 — External Service Integrations

**Goal:** Implement ISBNdb and TMDB enrichment at `CreateEvent` time for books and film_tv families. At the end of this phase creating a book or film/tv event automatically fetches and stores metadata and copies the cover/poster to S3.

### Tasks

- Define an `Enricher` interface in `internal/domain/event.go`:
  ```go
  type Enricher interface {
      Enrich(ctx context.Context, event *Event) error
  }
  ```
- Implement `internal/enrichment/isbndb.go`:
  - `ISBNdbEnricher` — fetches book metadata by ISBN from ISBNdb API
  - Populates `metadata.author`, `metadata.cover_image_url` (initially the ISBNdb URL), `metadata.preview_url`
  - Downloads cover image and uploads to S3; replaces `cover_image_url` with S3 URL
- Implement `internal/enrichment/tmdb.go`:
  - `TMDBEnricher` — fetches film/TV metadata by TMDB ID
  - Populates `metadata.director` or `metadata.network`, `metadata.year`, `metadata.poster_url` (initially TMDB URL)
  - Downloads poster and uploads to S3; replaces `poster_url` with S3 URL
- Implement `internal/enrichment/s3.go`:
  - `UploadFromURL(ctx, sourceURL, s3Key) (string, error)` — downloads from URL and uploads to S3, returns S3 URL
- Wire enrichers into `CreateEvent` in `internal/api/grpc/timeline.go`:
  - After basic validation, before DB insert, call the appropriate enricher based on `family_id`
  - If enrichment fails, return `codes.Internal` with a descriptive message — do not store a partially enriched event
- Add ISBNdb API key and TMDB API key and S3 bucket config to `config.yaml` and `config.go`

### Unit Tests (`internal/enrichment`)

Tests use an `httptest.Server` to mock ISBNdb and TMDB responses, and a mock S3 client.

**ISBNdb enricher:**
- Valid ISBN returns populated author and cover URL fields
- Cover image is uploaded to S3 and metadata URL is replaced with S3 URL
- ISBNdb API error returns wrapped error
- ISBNdb returns unknown ISBN — enricher returns not-found error
- S3 upload failure returns wrapped error

**TMDB enricher:**
- Valid TMDB ID with `type=movie` returns director and year
- Valid TMDB ID with `type=tv` returns network and seasons
- Poster is uploaded to S3 and metadata URL is replaced with S3 URL
- TMDB API error returns wrapped error
- TMDB returns unknown ID — enricher returns not-found error

**S3 uploader:**
- Downloads from mock HTTP server and uploads to mock S3 — returns correct S3 URL
- HTTP download failure returns error
- S3 upload failure returns error

### API Tests (`internal/api/grpc` — enrichment integration)

These use mock enrichers injected via the `Enricher` interface.

- `CreateEvent` for `family_id=books` calls enricher with the event; stored event has enriched metadata
- `CreateEvent` for `family_id=film_tv` calls enricher with the event; stored event has enriched metadata
- `CreateEvent` for any other family does not call enricher
- Enricher failure on book creation returns `codes.Internal` and no event is stored

---

## Phase 7 — Hardening & Integration

**Goal:** Production-readiness pass. Structured logging, graceful shutdown, request validation, and full end-to-end integration tests covering both servers together.

### Tasks

- Add structured logging via `log/slog` throughout — log at startup, per request (REST), per RPC (gRPC), and on errors
- Implement graceful shutdown: both servers drain in-flight requests on `SIGTERM`/`SIGINT` with a configurable timeout
- Add request timeouts to REST handlers via context deadline
- Add metadata validation helpers in `internal/domain`:
  - `ValidateMetadata(familyID string, metadata map[string]any) error` — checks required fields per family; e.g. flights require `airline` and `flight_number`, climbing requires valid `climbing_type`
  - Call from `CreateEvent` and `UpdateEvent` before DB write
- Add index to `events` table: `(family_id, date, deleted_at)` for common query patterns
- Add index to `events` table: `(source_service, source_event_id)` for import deduplication lookups
- Write a `Makefile` with targets: `build`, `test`, `generate` (runs protoc), `migrate`

### Unit Tests (`internal/domain` — validation)

- Valid flight metadata passes validation
- Flight metadata missing `airline` returns error
- Valid climbing metadata with `climbing_type=sport` and `route_name` passes
- Climbing metadata with `climbing_type=sport` missing `route_name` returns error
- Climbing metadata with unknown `climbing_type` returns error
- Valid fitness metadata for each activity type passes
- Fitness metadata with unknown `activity` returns error
- Spine metadata with unknown `milestone_type` returns error

### Integration Tests

Integration tests start the full binary against a temp SQLite file and exercise both servers together.

- Start server, confirm REST responds on configured port and gRPC responds on configured port
- Create event via gRPC, retrieve via REST `GET /api/events/:id`
- Create personal event via gRPC, confirm unauthenticated REST request does not return it
- Create personal event via gRPC, confirm `owner` JWT REST request returns it
- Import events via gRPC, confirm they appear in REST `GET /api/timeline`
- Import duplicate events with `SKIP`, confirm only original is returned
- Soft delete event via gRPC, confirm REST returns 404
- Add and reorder photos via gRPC, confirm REST returns photos in correct order
- Graceful shutdown: in-flight REST request completes after `SIGTERM` is sent
