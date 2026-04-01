# Meridian — MCP Server Implementation Phases

Each phase is self-contained and leaves the codebase in a working state. Phases build strictly on the previous one — do not start a phase until the prior phase is functional.

The backend gRPC API this server wraps is documented in `meridian-backend.md`. All paths below are relative to the `mcp/` directory of the `rmrobinson/meridian` monorepo unless stated otherwise.

---

## Existing Scaffold

The `mcp/` directory already contains a working skeleton:

- `package.json` — declares `@modelcontextprotocol/sdk`, `nice-grpc`, `nice-grpc-common`
- `tsconfig.json` — standard TypeScript configuration
- `src/index.ts` — creates `McpServer` and connects to `StdioServerTransport`; no tools registered yet
- `src/client.ts` — empty placeholder for gRPC client setup
- `src/tools/createEvent.ts`, `updateEvent.ts`, `deleteEvent.ts`, `importEvents.ts` — empty placeholders
- `proto-gen/meridian/v1/` — generated TypeScript/nice-grpc bindings (do not edit; regenerate via `npm run proto`)
- `.env.example` — documents required env vars `BACKEND_GRPC_URL` and `BEARER_TOKEN`

The backend gRPC server runs on port 9090 by default and requires a `Authorization: Bearer <token>` header on every call. The valid `family_id` values are: `spine`, `employment`, `education`, `hobbies`, `travel`, `flights`, `books`, `film_tv`, `fitness`.

---

## Phase 1 — Package Hygiene & gRPC Client

**Goal:** The project builds cleanly with ESM modules, loads configuration from the environment, and exposes a working authenticated gRPC client. No MCP tools registered yet.

### Tasks

- Update `package.json`:
  - Add `"type": "module"` to enable ES module semantics (required by the generated proto files)
  - Add runtime dependencies: `dotenv`, `zod`
  - Add dev dependency: `tsx` (for running TypeScript directly without a build step)
  - Add a `dev` script: `node --import dotenv/config --import tsx/esm src/index.ts`
  - Verify existing `build` and `start` scripts still work after changes

- Update `tsconfig.json` if needed:
  - Set `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` for ESM compatibility
  - Set `"outDir": "dist"` and `"rootDir": "src"`

- Implement `src/client.ts`:
  - Read `BACKEND_GRPC_URL` and `BEARER_TOKEN` from `process.env`; throw at startup if either is missing
  - Create a `nice-grpc` channel using `createChannel(BACKEND_GRPC_URL)`
  - Create a `ClientMiddleware` that injects `Authorization: Bearer <BEARER_TOKEN>` into every call's metadata using `nice-grpc-common`'s `Metadata`
  - Create a `TimelineServiceClient` using `createClient(TimelineServiceDefinition, channel, { '*': [authMiddleware] })`
  - Export the client as the default export

- Update `src/index.ts`:
  - Import `dotenv/config` at the top so env vars are populated before anything else runs
  - Import the client from `src/client.ts` to trigger startup validation (missing env vars should abort early)

### Acceptance Criteria

- `npm run build` compiles without errors
- Running `BACKEND_GRPC_URL=localhost:9090 BEARER_TOKEN=x node dist/index.js` starts without crashing (MCP server connects to stdio transport and waits)
- Missing `BACKEND_GRPC_URL` or `BEARER_TOKEN` causes a clear error at startup

---

## Phase 2 — Core Tool Implementations

**Goal:** All five MCP tools are implemented and registered. An AI agent can list, create, update, delete, and bulk-import timeline events.

### Toolset

| Tool name | gRPC RPC | Description |
|---|---|---|
| `list_events` | `ListEvents` | Query events with optional filters |
| `create_event` | `CreateEvent` | Create a single event |
| `update_event` | `UpdateEvent` | Update fields on an existing event |
| `delete_event` | `DeleteEvent` | Soft-delete an event by ID |
| `import_events` | `ImportEvents` | Bulk-create events with conflict resolution |

### Deferred tools (not in this phase)

- `add_photo`, `remove_photo`, `reorder_photos` — photo management requires URL/binary data; awkward for text-based LLM interaction
- `merge_events`, `unmerge_event` — advanced curation; add in a later phase
- `get_event` (single by ID) — `list_events` with filtering is sufficient for now

### Tasks

#### `src/tools/listEvents.ts`

Create this file (no placeholder exists). Implement a `list_events` tool:

- Input schema (all optional):
  - `family_id` — string, filter by family ID
  - `line_key` — string, filter by line key within a family
  - `include_deleted` — boolean, default `false`

- Call `client.listEvents({ familyId, lineKey, includeDeleted })` mapping camelCase inputs to proto snake_case fields
- Return a formatted text block listing each event: `id | title | family_id | type | date/start_date–end_date | visibility`
- If the result set is empty, return a clear message rather than an empty string

#### `src/tools/createEvent.ts`

- Required inputs:
  - `title` — string
  - `family_id` — string enum (one of the 9 valid family IDs)
  - `type` — `"span"` | `"point"`

- Optional inputs (include all that have backend support):
  - `date`, `start_date`, `end_date` — string (ISO 8601 date)
  - `description` — string
  - `activity_type` — string enum matching `ActivityType` proto values (lowercase, without prefix)
  - `visibility` — `"personal"` | `"family"` | `"friends"` | `"public"` (default `"personal"`)
  - `line_key`, `parent_line_key` — string
  - `location_label`, `location_lat`, `location_lng` — string/number for a location
  - `external_url` — string
  - `metadata` — string (raw JSON; family-specific structured data)
  - `source_service`, `source_event_id` — string (for import attribution)

- Map enum string inputs to the generated `EventType`, `ActivityType`, `Visibility` enum values
- Call `client.createEvent(...)` and return the created event's `id` and `title`

#### `src/tools/updateEvent.ts`

- Required input: `id` — string
- Optional inputs: same set as `createEvent` (omit `family_id` and `type` as these are typically immutable after creation)
- Only include fields in the RPC request that were explicitly provided (do not send defaults for absent fields)
- Return the updated event's `id` and `title`

#### `src/tools/deleteEvent.ts`

- Required input: `id` — string
- Call `client.deleteEvent({ id })`
- Return a confirmation message: `"Event <id> deleted."`
- The backend performs a soft delete; note this in the tool description so agents understand it is reversible by an operator

#### `src/tools/importEvents.ts`

- Input schema:
  - `events` — array of event objects (same optional/required structure as `create_event`, minus `id`)
  - `conflict_strategy` — `"upsert"` | `"skip"`, default `"skip"`
  - `source_service` — string (identifies the import source; required when using import)

- Call `client.importEvents(...)` passing the mapped event list and conflict strategy
- Return a summary: `"Imported: <created> created, <updated> updated, <skipped> skipped."`

#### `src/index.ts` updates

- Import all five tool modules and register each with `server.tool(name, description, zodSchema, handler)`
- Tool descriptions should be concise but include the word "Meridian" and the key action, so agents can discover them by purpose

### Acceptance Criteria

- `npm run build` compiles without errors
- Each tool can be invoked via the MCP inspector (`npx @modelcontextprotocol/inspector`) against a running backend
- `list_events` returns events from the backend
- `create_event` with required fields only succeeds and returns an ID
- `update_event` changes the title of an existing event
- `delete_event` soft-deletes an event (it no longer appears in `list_events` by default)
- `import_events` with `conflict_strategy: "skip"` does not duplicate an event on re-import

---

## Phase 3 — Error Handling & Observability

**Goal:** Errors from the gRPC backend are surfaced to the AI agent as readable MCP tool errors rather than unhandled exceptions. Startup problems are logged clearly.

### Tasks

- Wrap every gRPC call in a try/catch that maps `ServiceError` (from `nice-grpc-common`) status codes to human-readable MCP error messages:
  - `NOT_FOUND` → `"Event <id> not found."`
  - `INVALID_ARGUMENT` → pass through the gRPC error message directly
  - `UNAUTHENTICATED` / `PERMISSION_DENIED` → `"Authentication failed — check BEARER_TOKEN."`
  - All others → `"Backend error (<code>): <message>"`

- Add a `stderr` logger (simple `console.error` is sufficient; do not use a logging library) for startup errors and unexpected gRPC failures

- Validate that `BACKEND_GRPC_URL` is a valid `host:port` string at startup (basic regex check)

### Acceptance Criteria

- Calling `delete_event` with a non-existent ID returns a readable error string to the MCP client, not an uncaught exception
- Calling `create_event` with an invalid `family_id` returns the backend's validation message
- Starting with a malformed `BACKEND_GRPC_URL` (e.g. `not-a-url`) logs a clear error and exits with a non-zero code

---

## Phase 4 — Performance: Pagination

**Goal:** `list_events` supports pagination so agents can work with large datasets without receiving oversized responses.

### Background

The `ListEventsRequest` proto has `page_token` (string) and `page_size` (int32) fields. The response includes `next_page_token`. This phase exposes those fields.

### Tasks

- Add optional inputs to `list_events`:
  - `page_size` — integer, default `0` (backend interprets 0 as "return all"); recommended max 100
  - `page_token` — string, opaque token from a previous `list_events` response

- Include `next_page_token` in the tool's output when present, formatted as:
  ```
  [N events listed]
  Next page token: <token>  (pass as page_token to retrieve the next page)
  ```

- Update tool description to mention pagination support

### Acceptance Criteria

- `list_events` with `page_size: 10` returns at most 10 events and includes a `next_page_token` when more exist
- Passing `next_page_token` from the first response returns the next page
- `list_events` with no `page_size` still returns all events (existing behavior preserved)

---

## Future Phases (not yet planned in detail)

- **Photo tools** — `add_photo`, `remove_photo`, `reorder_photos` once a URL-based workflow is defined
- **Merge tools** — `merge_events`, `unmerge_event` for agent-assisted deduplication
- **Read-only mode** — configurable flag to disable write tools (for agents with read-only access)
- **Streaming** — if the backend adds server-streaming RPCs, expose them as MCP resources rather than tools
