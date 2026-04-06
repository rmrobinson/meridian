# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Meridian is a personal life timeline visualization system. It is a monorepo with five components: `backend/` (Go), `web-timeline/` (vanilla JS), `mcp/` (TypeScript MCP server), `android/` (stub), and `proto/` (shared protobuf definitions).

## Commands

### Proto Code Generation (required before building anything)

```bash
./generate.sh          # runs buf generate from proto/, outputs to backend/gen/go/ and mcp/proto-gen/
```

### Proto Lint and Format (required after editing any .proto file)

After any change to a `.proto` file, run these two commands from the repo root and fix all reported issues before committing:

```bash
buf lint proto           # checks style rules (enum zero values, field naming, etc.)
buf format --diff proto  # shows formatting diff; add --write to apply in place
```

### Backend (Go)

```bash
cd backend
make build             # GOWORK=off go build ./...
make test              # GOWORK=off go test ./...
make generate          # runs buf generate (same as ./generate.sh)

# Run a single test
GOWORK=off go test ./internal/api/grpc/ -run TestEventCRUD -v

# Run the server (requires config.yaml)
go run ./cmd/server/main.go --config config.yaml
```

### Frontend (web-timeline)

```bash
cd web-timeline
npm install
npm run serve          # serves on http://localhost:3000 using mock fixture (no backend needed)
npm test               # Vitest unit tests
npm run test:e2e       # Playwright integration tests
npm run check-icons    # verify all referenced SVG icons exist
```

### MCP Server

```bash
cd mcp
npm install
npm run build
# Requires BACKEND_GRPC_URL and BEARER_TOKEN environment variables
```

## Architecture

### Dual API Pattern

The backend runs two separate servers:
- **REST API (`:8080`)** — read-only, public-facing, JWT-scoped visibility. Unauthenticated callers see only `visibility = "public"` events; JWT roles (`friends`, `family`, `owner`) progressively unlock higher visibility tiers. No write operations. Routes are registered in `backend/internal/api/rest/server.go`; handlers live alongside it in `timeline.go`, `events.go`, and `lines.go`.
- **gRPC API (`:9090`)** — write-capable, bearer-token auth (bcrypt hashed in config), used by CLI tools, importers, and the MCP server. Service definition is in `proto/meridian/v1/timeline.proto`; handlers live in `backend/internal/api/grpc/` (`timeline.go`, `photos.go`, `merge.go`). Proto↔domain conversions are centralized in `backend/internal/api/grpc/mapping.go`.

### Line Family System

Timeline "lines" are not hardcoded — they are fully defined in `config.yaml` under `line_families`. Each family has:
- `id`, `label`, `base_color_hsl`, `side` (left/right/center)
- `on_end`: `merge` (curves back to parent), `terminate`, or `never`
- `spawn_behavior`: `per_event` (new branch per span), `single_line` (all events on one lane), or `secondary_spine` (parallel full-height line)
- `parent_family_id`: optional; causes branches to depart from another family's lane instead of the main spine

### Event Merging

When the same real-world event appears in multiple sources (e.g., Garmin + Strava for a run):
- One DB row is **canonical** (`canonical_id IS NULL`); others point to it via `canonical_id`
- Field resolution uses **source priority** from config (`source_priority` array); `manual` always wins regardless
- Auto-merge triggers on same date + same activity type
- REST API returns only canonical rows

### Database

SQLite with `SetMaxOpenConns(1)` (single-threaded). Migration SQL files live in `backend/internal/db/migrations/` and are embedded via `//go:embed migrations/*.sql` + `iofs` source driver. They run automatically on `db.Open()` via golang-migrate — never create tables inline in Go, always add a new `*.up.sql` file. There is no standalone `migrate` Makefile target or `cmd/migrate` binary; auto-run on startup is intentional. Foreign key constraints are enabled explicitly.

### Metadata

Each event family stores family-specific data as a JSON string in the `metadata` column (TEXT in DB). The proto API exposes typed metadata messages (one per family) via a `oneof metadata` field on `Event`, `CreateEventRequest`, and `UpdateEventRequest`. Domain typed structs live in `backend/internal/domain/metadata.go`. Use the generic helpers `domain.ParseMetadata[T]` and `domain.SetMetadata[T]` everywhere — never do ad-hoc `json.Unmarshal`/`json.Marshal` on event metadata in handler or enricher code. Do not add typed metadata fields to DB columns. When adding a new family's metadata schema: add a struct to `domain/metadata.go`, add a proto message to `timeline.proto`, add it to the `oneof metadata` in all three request/response messages, and add the proto↔domain conversion in `mapping.go`.

### Proto as Single Source of Truth

All API contracts live in `proto/meridian/v1/timeline.proto`. Generated code is gitignored; always run `./generate.sh` after changing `.proto` files.

**Enum rule**: Use proto enums (not string fields) for any field whose valid values form a closed, known set. This applies everywhere in the proto — top-level message fields, nested metadata message fields, anywhere. A string field with a comment listing valid values (e.g. `// one of: foo, bar`) is wrong; define an enum instead. Enum naming convention: `ENUM_NAME_VALUE` with `ENUM_NAME_UNSPECIFIED = 0` as the zero value. All proto↔domain conversion helpers (including enum mappings) live in `backend/internal/api/grpc/mapping.go`.

### Frontend Architecture

`web-timeline/` is vanilla JavaScript with no framework. The data pipeline is:
1. **`api.js`** — fetch REST, normalize, generate birthday events, resolve flights to parent trips
2. **`main.js`** — lane assignment, Y position computation (dates → pixels), card sheet management
3. **`timeline.js`** — virtualized SVG rendering; only elements within viewport ± buffer are in the DOM

Zoom levels (Day/Month/Year) trigger `buildRenderObjects()` re-computation with aggregation — no re-fetch. The zoom function aggregates point events per (family_id, year-month) at ZOOM_MONTH and drops them entirely at ZOOM_YEAR.

### Backend Tests

gRPC integration tests use **in-memory SQLite** (`file:<name>?mode=memory&cache=shared`) and an in-process **`bufconn`** listener — no real network, no mocks of the database. The `domain.Enricher` interface is mocked via a lightweight `mockEnricher` struct defined in the test file. See `backend/internal/api/grpc/grpc_test.go` for the `newTestEnv` helper pattern to follow when adding new tests.

### Logging

Use `go.uber.org/zap` for all logging in backend Go code. Never use `log` or `slog`.

### Workflow

Always ask for explicit approval before running `git commit`. Present a summary of changes and wait for confirmation.

### Configuration

Backend config is loaded from a YAML file via Viper. See `backend/config.yaml.example` for the full schema including line family definitions, write token hashes, JWT secret, enrichment API keys (ISBNdb, TMDB), and S3 settings.
