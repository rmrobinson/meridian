# Meridian Android — Architecture & Design

## Overview

A companion Android app for submitting and viewing Meridian timeline events. The app maintains a local SQLite store synced to the backend via gRPC, presents a simplified timeline view, and provides fast-entry flows for event types across all line families. The FAB groups entry by: Travel (flights), Fitness, and Hobbies — where Hobbies is a landing screen covering books (ISBN barcode), films, TV series, concerts, and other hobby types. Employment and Education entry are lower-priority and omitted from the initial FAB. The collapsing of books and film/TV under the Hobbies FAB entry is a UI navigation decision only — the backend family_id values ("books", "tv", "hobbies") are unchanged.

---

## Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | Kotlin | |
| UI | Jetpack Compose + Material 3 | Standard component library throughout |
| Architecture | MVVM | ViewModel + StateFlow, no MVI overhead needed |
| Local DB | Room | SQLite abstraction, matches backend's single-table approach |
| gRPC | `grpc-kotlin` + `protoc` generated stubs | Same proto files as backend (monorepo root) |
| DI | Hilt | Standard for Compose + ViewModel wiring |
| Barcode scanning | ML Kit Barcode Scanning | On-device, no network call; handles QR, PDF417, Code128, DataMatrix — all formats used by boarding passes and ISBN barcodes |
| Image loading | Coil | Compose-native |
| Coroutines | kotlinx.coroutines | All async including gRPC streaming |
| Build | Gradle (Kotlin DSL) | `buf generate` runs as part of the proto Gradle task, consistent with CI |
| Min SDK | 26 (Android 8.0) | Required by CameraX and ML Kit; covers Pixel 6 on Android 15 |
| Target SDK | 35 (Android 15) | Pixel 6 minimum target hardware |
| Compile SDK | 35 | |

---

## Module Structure

```
android/
  app/
    src/main/
      java/ca/rmrobinson/meridian/
        MeridianApp.kt           — Hilt application class
        MainActivity.kt          — single Activity, Compose NavHost root
        /data
          /local
            MeridianDatabase.kt  — Room database
            EventDao.kt
            EventEntity.kt       — local schema (mirrors event fields + sync state)
            LineFamilyDao.kt
            LineFamilyEntity.kt  — cached family definitions including baseColorH/S/L
          /remote
            GrpcClient.kt        — channel setup, bearer token interceptor
            EventRemoteSource.kt — wraps generated proto stubs
          /repository
            EventRepository.kt   — single source of truth; local-first reads, gRPC writes
        /domain
          /model
            Event.kt             — domain model (family-agnostic base)
            BookEvent.kt
            FilmEvent.kt
            FlightEvent.kt
          /usecase
            SyncEventsUseCase.kt
            CreateEventUseCase.kt
            UpdateEventUseCase.kt
        /ui
          /timeline
            TimelineScreen.kt
            TimelineViewModel.kt
          /entry
            /flight
              FlightLandingScreen.kt   — scan vs manual choice
              FlightScanScreen.kt      — camera → BCBP → per-leg confirmation
              FlightManualScreen.kt    — manual form
              FlightEntryViewModel.kt
            /fitness
              FitnessLandingScreen.kt  — Garmin import | Strava import | manual (future)
              FitnessManualScreen.kt   — manual activity form (future)
              FitnessImportScreen.kt   — OAuth + activity selection (future)
              FitnessEntryViewModel.kt
            /hobbies
              HobbyLandingScreen.kt    — type picker: Book | Film | TV Series | Concert | Festival | Other
              HobbyEntryViewModel.kt   — shared VM; maps selected type to correct family_id
              /book
                BookScanScreen.kt      — camera → ISBN → form
                BookManualScreen.kt    — manual book form
              /film
                FilmScreen.kt          — title + year + watched date + rating
              /tv
                TvScreen.kt            — title + year + watched date range + rating
              /other
                OtherHobbyScreen.kt    — generic form for concerts, festivals, etc.
          /scanner
            ScannerScreen.kt     — shared camera + barcode component
            ScannerViewModel.kt
          /edit
            EditEventScreen.kt   — editable fields only, read-only context header
            EditEventViewModel.kt
          /setup
            SetupScreen.kt       — first-launch gRPC host + bearer token entry
            SetupViewModel.kt
          /settings
            SettingsScreen.kt    — same fields as setup, reachable from timeline top bar
            SettingsViewModel.kt
          /common
            (shared Compose components)
        /util
          BcbpParser.kt
          IsbnValidator.kt
      res/
        (existing icon assets)
  # No proto/ directory in android/ — stubs are generated directly from
  # proto/timeline.proto at the monorepo root via buf.gen.yaml (see Phase 1)
```

---

## Local Data Model

A single `events` table in Room mirrors the backend schema closely enough to round-trip without transformation loss. Sync state is tracked locally only.

```kotlin
@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey val id: String,               // backend-assigned or client-generated UUID
    val familyId: String,
    val lineKey: String,
    val type: String,                         // "span" or "point"
    val title: String,
    val startDate: String?,                   // ISO 8601
    val endDate: String?,
    val date: String?,
    val locationLabel: String?,
    val locationLat: Double?,
    val locationLng: Double?,
    val description: String?,
    val externalUrl: String?,
    val heroImageUrl: String?,
    val metadataJson: String,                 // serialized JSON blob, matches backend
    val syncState: SyncState,                 // LOCAL_ONLY | SYNCED | PENDING_UPDATE
    val createdAt: Long,
    val updatedAt: Long
)

enum class SyncState { LOCAL_ONLY, SYNCED, PENDING_UPDATE }
```

**`line_key` generation:** for `per_event` families the app generates the key as `{family_id}-{ISO-date}`, e.g. `books-2025-07-03`. If two events in the same family share the same date a counter suffix is appended: `books-2025-07-03-2`. For `single_line` families (fitness) the `line_key` is always just the `family_id`. The backend is the authority on whether a key is accepted; if it returns a different key on the create response the local row is updated to match.

```kotlin
```

`metadataJson` stores the family-specific metadata as a JSON string, identical to the backend's `metadata` column. No separate per-family tables — keeps the schema stable as families evolve.

A second `line_families` table caches the family definitions returned by the API:

```kotlin
@Entity(tableName = "line_families")
data class LineFamilyEntity(
    @PrimaryKey val id: String,          // e.g. "books", "travel"
    val label: String,
    val baseColorH: Int,                 // HSL components stored separately
    val baseColorS: Int,                 // for easy Compose Color construction
    val baseColorL: Int,
    val side: String,
    val onEnd: String,
    val spawnBehavior: String
)
```

`LineFamilyEntity` is upserted from the `ListLineFamilies` gRPC response on each sync. **No family colour values are hardcoded in the app.** All UI colour derivation — card pip tints, icon tints, edit context borders, bottom sheet icon backgrounds — reads `baseColorH/S/L` from the cached `LineFamilyEntity` for the relevant `family_id` and constructs a `androidx.compose.ui.graphics.Color` at runtime:

```kotlin
fun LineFamilyEntity.toColor(): Color =
    Color.hsl(baseColorH.toFloat(), baseColorS / 100f, baseColorL / 100f)
```

For dark-mode legibility, the lightness value from the API is treated as a baseline and adjusted by the ViewModel (+15% for dark theme, matching the web frontend's CSS token approach) rather than used directly. This keeps colours consistent across web and Android without embedding a separate palette.

---

## Sync Strategy

**Read (populate local store):**
`SyncEventsUseCase` calls the gRPC `ListEvents` RPC on app launch and on explicit pull-to-refresh.

**First-launch behaviour:** on first sync the Room DB is empty. The timeline screen shows a loading indicator while the initial sync runs; once complete it transitions to the event list. Subsequent launches show the cached Room data immediately while a background sync runs, updating the list in place via `StateFlow`. Response is upserted into Room. The same sync call also fetches `line_families` from the API and upserts them into the `line_families` Room table. The timeline screen always reads from Room — it never reads directly from the remote.

**Write (create/update):**
`CreateEventUseCase` writes to Room first with `syncState = LOCAL_ONLY`, then fires the gRPC `CreateEvent` RPC. On success the row is updated to `SYNCED`. On failure it stays `LOCAL_ONLY` and is retried on next sync. This gives immediate local feedback with no blocking network wait.

Conflicts are last-write-wins. The backend is the authority on `id` — client generates a temporary UUID which is replaced with the backend-assigned ID on the create response.

---

## Navigation

Single `NavHost` in `MainActivity`. Routes:

```
setup/                         — first-launch configuration (gRPC host + bearer token)
timeline/                      — home screen (start destination once configured)
settings/                      — gRPC host + bearer token re-configuration

entry/flight/                  — travel family landing: scan boarding pass | enter manually
entry/flight/scan              — camera → BCBP → per-leg confirmation cards
entry/flight/manual            — manual origin/destination/date/carrier form

entry/fitness/                 — fitness family landing: Garmin import | Strava import | manual (future)
entry/fitness/import           — OAuth + activity selection (future)
entry/fitness/manual           — activity type, distance, duration, date form (future)

entry/hobbies/                 — hobbies landing: choose hobby type (Book, Film, TV Series, Concert, etc.)
entry/hobbies/book/scan        — camera → ISBN → pre-filled book form
entry/hobbies/book/manual      — manual book form
entry/hobbies/film/            — film form (title + year + watched date + rating)
entry/hobbies/tv/              — TV series form (title + year + watched date range + rating)
entry/hobbies/other/           — generic hobby form (type, date, notes) for concerts, festivals, etc.

edit/{eventId}                 — edit screen for an existing event (fields vary by family_id)
scanner/{mode}                 — shared camera screen; mode = "isbn" | "bcbp"
```

On launch, `MainActivity` checks encrypted SharedPreferences for a saved host and token. If absent, it navigates to `setup/` and blocks forward navigation until both are saved. Once configured, `setup/` is never shown again automatically — the user reaches it via `settings/` from the timeline top bar (overflow menu or gear icon).

The FAB on the timeline screen is a single `+` button. Tapping it opens a **modal bottom sheet** (`ModalBottomSheet` from Material 3) with three rows: **Travel**, **Fitness**, **Hobbies**. Each row shows the family icon and label.

- **Travel** → `entry/flight/` landing (scan boarding pass | enter manually). Covers the travel family; additional travel entry types (e.g. multi-stop trips) can be added as options on this landing screen later.
- **Fitness** → `entry/fitness/` landing (Garmin import | Strava import | manual). Future phase.
- **Hobbies** → `entry/hobbies/` landing: a type picker presenting Book, Film, TV Series, Concert, Festival, and Other as large tappable cards. Selecting a type navigates to the appropriate form. This landing screen maps to multiple backend family_ids (`"books"`, `"tv"`, `"hobbies"`) depending on selection — that mapping is internal to `HobbyEntryViewModel`.

Employment and Education are intentionally omitted from the FAB — these are infrequent events better entered via the web editor.

---

## Shared Scanner Component

Both ISBN (books) and BCBP (flights) scanning use the same `ScannerScreen`. The `mode` nav argument controls which barcode formats ML Kit listens for and what happens after a successful scan.

```kotlin
// Barcode format sets by mode
val formats = when (mode) {
    "isbn" -> listOf(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A)
    "bcbp" -> listOf(Barcode.FORMAT_PDF_417, Barcode.FORMAT_AZTEC, Barcode.FORMAT_QR_CODE)
    else   -> listOf(Barcode.FORMAT_ALL_FORMATS)
}
```

After a successful scan, the scanner pops back and delivers the raw string to the originating entry screen via the `SavedStateHandle`. The entry screen's ViewModel then parses the result — `IsbnValidator` for books, `BcbpParser` for flights.

All processing is on-device. No network call is made from the scanner itself.

### CameraX Integration

Uses CameraX `ImageAnalysis` use case with ML Kit's `BarcodeScanner`. Analysis runs on a background executor. Once a barcode is detected, scanning is paused (to prevent duplicate fires) and the result is posted to a `StateFlow`.

---

## BCBP Parser

BCBP (IATA resolution 792) is a fixed-format string. The mandatory fields in the first leg are sufficient for Meridian's flight event.

```kotlin
object BcbpParser {

    data class ParsedFlight(
        val passengerName: String,
        val operatingCarrierDesignator: String,  // e.g. "AC"
        val flightNumber: String,                // e.g. "0301"
        val originAirport: String,               // IATA 3-letter, e.g. "YYZ"
        val destinationAirport: String,          // IATA 3-letter, e.g. "LHR"
        val julianDate: Int,                     // day of year
        val compartmentCode: String,
        val seatNumber: String,
        val sequenceNumber: String
    )

    fun parse(bcbp: String): ParsedFlight? {
        if (bcbp.length < 60) return null
        return try {
            ParsedFlight(
                passengerName              = bcbp.substring(2, 22).trim(),
                operatingCarrierDesignator = bcbp.substring(36, 39).trim(),
                flightNumber               = bcbp.substring(39, 44).trim(),
                originAirport              = bcbp.substring(30, 33),
                destinationAirport         = bcbp.substring(33, 36),
                julianDate                 = bcbp.substring(44, 47).trim().toInt(),
                compartmentCode            = bcbp.substring(47, 48),
                seatNumber                 = bcbp.substring(48, 52).trim(),
                sequenceNumber             = bcbp.substring(52, 57).trim()
            )
        } catch (e: Exception) {
            null
        }
    }
}
```

Julian date is resolved to a calendar date in the ViewModel using the current year as the base (with rollover handling for January scans of December tickets).

Multi-leg boarding passes encode all legs sequentially in the same BCBP string (the leg count is in byte 1, format indicator `>`). `BcbpParser.parse()` returns a `List<ParsedFlight>` — one entry per leg. The flight entry screen presents each leg as a separate card for the user to confirm, and submitting creates one event per leg via sequential `CreateEvent` gRPC calls.

---

## Entry Flows

### Book Entry

1. User taps "Hobbies" from FAB → `HobbyLandingScreen`
2. User selects "Book" → `BookScanScreen` or `BookManualScreen` choice
3. "Scan barcode" → navigates to `scanner/isbn`
4. Scanner returns ISBN string → `HobbyEntryViewModel` validates and pre-fills title field (ISBN stored in metadata; enrichment happens on the backend via Open Library)
5. User fills in: start date (when they started reading), end date (when finished), optional rating and review
6. Submit → `CreateEventUseCase` → Room → gRPC

The app does **not** call Open Library directly. It sends the ISBN in `metadata.isbn` and the backend enricher fills in title, author, and cover on its side. This keeps the Android app free of TMDB/Open Library API keys.

Fields submitted:
```json
{
  "family_id": "books",
  "type": "span",
  "title": "<isbn as placeholder, backend replaces>",
  "start_date": "...",
  "end_date": "...",
  "metadata": {
    "isbn": "9780441013593",
    "rating": 5,
    "review": "..."
  }
}
```

### Film/TV Entry

1. User taps "Hobbies" from FAB → `HobbyLandingScreen`
2. User selects "Film" or "TV Series" → `FilmScreen` or `TvScreen`
3. Text field for title + optional year; no TMDB lookup on Android side
4. User also specifies: watched date (film) or watched date range (series — when the user started and finished watching, not air dates), rating

Fields submitted for a film:
```json
{
  "family_id": "tv",
  "type": "point",
  "title": "Severance",
  "date": "2025-03-01",
  "metadata": {
    "query_year": 2022,
    "type": "film",
    "rating": 5
  }
}
```

Fields submitted for a series:
```json
{
  "family_id": "tv",
  "type": "span",
  "title": "Severance",
  "start_date": "2025-02-15",
  "end_date": "2025-03-01",
  "metadata": {
    "query_year": 2022,
    "type": "series",
    "seasons_watched": 2,
    "rating": 5
  }
}
```

The backend uses `title` + `query_year` to do the TMDB lookup and replace the title with the canonical name. Air dates are not used — the date fields always reflect when the user watched.

### Flight Entry

1. User taps "Travel" from FAB → `FlightLandingScreen`
2. Two options presented: "Scan boarding pass" (→ `scanner/bcbp`) or "Enter manually"
3. Scan path: BCBP parsed → fields pre-populated (origin, destination, carrier, flight number, date)
4. Manual path: form fields for the same data
5. User confirms/edits pre-populated data and submits

Fields submitted:
```json
{
  "family_id": "travel",
  "type": "point",
  "title": "AC301 YYZ→LHR",
  "date": "2025-06-14",
  "location": { "label": "London Heathrow", "lat": null, "lng": null },
  "metadata": {
    "flight_number": "AC301",
    "origin_iata": "YYZ",
    "destination_iata": "LHR",
    "carrier": "AC",
    "seat": "34A",
    "departure_time": null,
    "arrival_time": null,
    "aircraft_type": null,
    "tail_number": null
  }
}
```

Title is auto-composed by the ViewModel from the parsed BCBP fields; user can edit before submit.

---

## Timeline Screen

A `LazyColumn` of event cards pulled from Room via `TimelineViewModel`. Cards are grouped by year (sticky headers). Each card shows: event title, family colour indicator, date(s), and an optional thumbnail if `heroImageUrl` is set (loaded via Coil). Cards with `syncState == LOCAL_ONLY` or `PENDING_UPDATE` show a small filled circle indicator (using the travel family colour, `hsl(50, 85%, 50%)`) on the trailing edge. The indicator is removed once `syncState` transitions to `SYNCED`. No indicator is shown for `SYNCED` events — absence of the dot is the success state.

The screen is not a full subway-map reproduction — that's the web frontend's job. This is a chronological list view optimized for quick entry and review on mobile.

Pull-to-refresh triggers `SyncEventsUseCase`. A sync status indicator (last synced time, or "Syncing…") is shown in the top bar.

### Open Spans Filter

A filter chip in the top bar (or alongside the search bar if one is added later) toggles an **"In Progress"** view that narrows the list to span events with no `end_date`. This covers currently-being-read books, in-progress TV series, and any other open spans. `TimelineViewModel` applies this as a Room query filter — no extra RPC needed.

Each card in the filtered view shows a **"Mark complete"** trailing action — either a button on the card itself or a swipe-to-reveal action. Tapping it opens a small bottom sheet with just the completion date field (defaulting to today) and a confirm button. On confirm, `UpdateEventUseCase` sets `end_date`, writes to Room with `syncState = PENDING_UPDATE`, and fires the gRPC `UpdateEvent` RPC. This is intentionally not a full edit screen — it's a one-tap completion flow.

### Edit Flow

Tapping an event card navigates to `edit/{eventId}`. The edit screen shows only the fields that are meaningful to change post-creation, determined by `family_id` and `type`:

| Event type | Editable fields |
|---|---|
| Book | End date, rating, review |
| Film | Watched date, rating |
| TV Series | End date (watched), rating |
| Concert / Festival / other Hobby | Date, notes |
| Flight | Departure time, arrival time, aircraft type, tail number, notes |
| Fitness (future) | Duration, distance, notes |

Immutable fields (ISBN, TMDB title, flight number, origin/destination, start date) are shown as read-only context at the top of the screen so the user knows what they're editing, but are not editable.

`EditEventViewModel` loads the event from Room by ID, populates the form, and on save calls `UpdateEventUseCase` → Room (`PENDING_UPDATE`) → gRPC `UpdateEvent`. The same optimistic-write pattern as creation applies.

---

## AppConfig

`AppConfig` is a data class holding all user-configurable connection settings. It is serialized to and deserialized from encrypted SharedPreferences using the AndroidX Security library (`EncryptedSharedPreferences`). The Hilt module provides a singleton instance that is read once at startup and updated whenever the user saves new settings.

```kotlin
data class AppConfig(
    val grpcHost: String,
    val grpcPort: Int,
    val bearerToken: String
) {
    val isConfigured: Boolean
        get() = grpcHost.isNotBlank() && bearerToken.isNotBlank()

    companion object {
        val EMPTY = AppConfig(grpcHost = "", grpcPort = 443, bearerToken = "")

        fun fromPrefs(prefs: SharedPreferences) = AppConfig(
            grpcHost    = prefs.getString("grpc_host", "") ?: "",
            grpcPort    = prefs.getInt("grpc_port", 443),
            bearerToken = prefs.getString("bearer_token", "") ?: ""
        )
    }

    fun toPrefs(editor: SharedPreferences.Editor) {
        editor.putString("grpc_host", grpcHost)
        editor.putInt("grpc_port", grpcPort)
        editor.putString("bearer_token", bearerToken)
    }
}
```

`MainActivity` reads `AppConfig.isConfigured` on launch to decide whether to route to `setup/` or `timeline/`. `GrpcClient.reconfigure()` accepts a new `AppConfig` instance, shuts down the existing channel, and rebuilds it.

---

## gRPC Client Setup

```kotlin
@Singleton
class GrpcClient @Inject constructor(
    @ApplicationContext context: Context,
    config: AppConfig
) {
    private val channel = ManagedChannelBuilder
        .forAddress(config.grpcHost, config.grpcPort)
        .useTransportSecurity()
        .build()

    private val callCredentials = object : CallCredentials() {
        override fun applyRequestMetadata(
            requestInfo: RequestInfo,
            appExecutor: Executor,
            applier: MetadataApplier
        ) {
            val headers = Metadata()
            headers.put(
                Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER),
                "Bearer ${config.bearerToken}"
            )
            applier.apply(headers)
        }
    }

    val eventsStub: EventServiceGrpcKt.EventServiceCoroutineStub =
        EventServiceGrpcKt.EventServiceCoroutineStub(channel)
            .withCallCredentials(callCredentials)  // generated from proto/timeline.proto
}
```

The stub class names and RPC method names in `EventRemoteSource` are derived directly from `proto/timeline.proto` — Claude Code must read that file before writing any gRPC call site. Bearer token and host/port are stored in `AppConfig`, loaded from encrypted `SharedPreferences` (AndroidX Security library). `GrpcClient` is a Hilt singleton but exposes a `reconfigure(config: AppConfig)` function that shuts down the existing channel and builds a new one — called by `SettingsViewModel` after the user saves updated credentials. The setup screen and settings screen share the same underlying `AppConfig` write path.

---

## Extensibility for Future Entry Types

Adding a new hobby type (e.g. a new activity under Hobbies) requires a new screen under `/ui/entry/hobbies/` and a new card on `HobbyLandingScreen` — no changes to the bottom sheet or nav structure. Adding an entirely new FAB-level entry group (e.g. Employment) requires a new bottom sheet row, a new landing screen, and new sub-routes — but no changes to the data layer.

All entry types write through `CreateEventUseCase` and produce the same `EventEntity` shape with family-specific data in `metadataJson`. No changes to `EventRepository`, `EventEntity`, or `GrpcClient` are required for new entry types.

### Fitness-Specific Considerations

The fitness landing screen will offer three cards: **Import from Garmin**, **Import from Strava**, **Enter manually**.

Import paths authenticate once via OAuth (token stored in encrypted SharedPreferences alongside the gRPC token), then fetch recent activities and present them as a selectable list for the user to confirm before writing to Room + backend. The import path calls `CreateEventUseCase` in bulk — structurally identical to a single manual create. The scanner component is not used for fitness.

### Trip-Specific Considerations

The trip landing screen will offer: **Import from travel blog** (Hugo JSON feed, future) and **Enter manually**.

Trips are span events with a heavier data model: multiple locations, a hero image, a link to an external blog post, and potentially photos. Manual entry is a multi-step flow (dates → locations → media → review), implemented as a pager or sequential nav within the `entry/trip/` sub-routes. Photo capture uses `ActivityResultContracts.PickVisualMedia` and uploads to S3 before the gRPC create call — the only entry type that requires an upload step.

---



## Build Phases

### Phase 1 — Project Skeleton

**Before writing any Kotlin**, Claude Code must:
1. Read `proto/timeline.proto` to determine the exact RPC names, request/response message types, and field names used by the Android client. All gRPC call sites must reference the generated symbols from this file — no guessing at message shapes.
2. Generate `gradle/libs.versions.toml` with a mutually compatible dependency set anchored to the latest stable AGP version. After generating `build.gradle.kts`, run `./gradlew dependencies` and resolve any version conflicts before proceeding.

**Deliverables:**
- `gradle/libs.versions.toml` with pinned versions for: AGP, Kotlin, Compose BOM, Hilt, Room, gRPC-Kotlin, protobuf-kotlin, ML Kit barcode, CameraX, Coil, AndroidX Security, Navigation Compose
- Extend the existing `proto/buf.gen.yaml` with an additional Kotlin output target that writes generated stubs into `android/app/src/main/java/ca/rmrobinson/meridian/grpc/gen/` (gitignored). Follow the same pattern as the existing TypeScript MCP target in that file. Do not create a separate `buf.gen.yaml` in the `android/` directory.
- `MeridianApp`, `MainActivity`, `NavHost` with placeholder screens
- `GrpcClient` with bearer token interceptor; channel rebuilt when settings change
- `EventEntity` + `EventDao` + `Room` database
- `SetupScreen`: gRPC host + bearer token entry on first launch, stored in encrypted SharedPreferences; blocks navigation to timeline until saved
- `SettingsScreen`: same fields, accessible from timeline top bar overflow menu; saving triggers `GrpcClient` channel rebuild
- Hilt modules wiring everything together

### Phase 2 — Timeline + Sync
- `EventRepository` with local-first read, upsert on sync
- `SyncEventsUseCase` making sequential `ListLineFamilies` then `ListEvents` gRPC calls; families upserted first so colour data is available before event list renders
- `LineFamilyDao` + `LineFamilyEntity`; `toColor()` extension function with dark-mode lightness adjustment
- `TimelineViewModel` + `TimelineScreen` (LazyColumn, year headers, event cards); pip and tint colours derived from cached `LineFamilyEntity`, never hardcoded
- Unsynced indicator dot on cards where `syncState != SYNCED`; disappears once sync completes and Room emits the updated row
- Pull-to-refresh
- Sync status in top bar
- "In Progress" filter chip: Room query for open spans, toggle in `TimelineViewModel`
- "Mark complete" action on list cards: bottom sheet with date picker, `UpdateEventUseCase` → Room → gRPC

### Phase 3 — Scanner Component
- CameraX + ML Kit integration in `ScannerScreen`
- Format switching by `mode` nav arg
- `BcbpParser` with unit tests covering mandatory fields and multi-leg detection
- `IsbnValidator` (checksum validation)
- Result delivery via `SavedStateHandle`

### Phase 4 — Book Entry
- `HobbyLandingScreen` (type picker), `BookLandingScreen` (scan vs manual), `BookScanScreen`, `BookManualScreen` under `entry/hobbies/book/`
- Shared `HobbyEntryViewModel` mapping selected type to correct `family_id`; `BookEntryViewModel` handling ISBN validation and form state
- Barcode scan → ISBN pre-fill → form flow via `ScannerScreen` in `isbn` mode
- Date pickers (start date required, end date optional), star rating, review text field
- `CreateEventUseCase` → Room → gRPC
- Local optimistic write with sync state tracking

### Phase 5 — Flight Entry
- `FlightEntryScreen` + `FlightEntryViewModel`
- BCBP scan → field pre-population
- Manual entry form
- Julian date → calendar date resolution with year rollover handling
- Title auto-composition from parsed fields

### Phase 6 — Film/TV Entry
- `FilmScreen` and `TvScreen` under `entry/hobbies/film/` and `entry/hobbies/tv/`
- Routed from `HobbyLandingScreen` type picker; `HobbyEntryViewModel` sets `family_id = "tv"` for both
- Title + optional year input; no barcode scanner used
- Film: single watched date picker; TV Series: start + end date range picker
- `CreateEventUseCase` → Room → gRPC

### Phase 7 — Edit Screen
- `EditEventScreen` + `EditEventViewModel`
- Family-specific editable field sets per table above
- Read-only context header showing immutable fields
- `UpdateEventUseCase` → Room → gRPC

### Phase 8 — Polish
- Bottom sheet entry picker animation (sheet open/close)
- Empty state on timeline
- Error states (gRPC failures, scan failures, parse failures)
- Retry queue for `LOCAL_ONLY` events
- Offline indicator

---

## Error Handling Contract

Rather than leaving error handling to ad-hoc decisions across phases, all entry and sync paths follow these consistent patterns:

**gRPC failures on create/update:** the event remains in Room with `syncState = LOCAL_ONLY` or `PENDING_UPDATE`. A non-blocking snackbar informs the user. No entry screen is blocked — the user can continue using the app. Retry happens on next sync.

**gRPC failure on initial sync:** timeline shows an empty state with a "Retry" button rather than a loading spinner indefinitely.

**Malformed BCBP:** `BcbpParser` returns null. The scan screen shows an inline error ("Couldn't read this boarding pass") and re-enables the scanner for another attempt. The manual entry form is offered as a fallback.

**Invalid ISBN checksum:** `IsbnValidator` returns false. The book form shows an inline field error and clears the ISBN field. Scanner re-enabled.

**Room write failure:** treated as fatal — logged, and a snackbar shown. Should not occur in normal operation.

---

## Resolved Decisions

- **Mark complete**: a trailing action on list cards, not a full edit screen. Opens a minimal bottom sheet with a date field (defaults to today). Writes via `UpdateEventUseCase`.
- **Edit screen**: shows only post-creation-relevant fields per family. Immutable fields are displayed as read-only context. Reuses `UpdateEventUseCase`.

- **Multi-leg flights**: each leg is a separate event. `BcbpParser` returns a list of `ParsedFlight` objects; the flight entry screen shows one confirmation card per leg; submitting fires one `CreateEvent` call per leg.
- **TV series date range**: user-entered watch window (`start_date` / `end_date`). Air dates from TMDB are not used for the event date fields.
- **Setup / settings**: first launch blocks on `SetupScreen` until host + token are saved. Thereafter, `SettingsScreen` is reachable from the timeline top bar overflow menu and triggers a channel rebuild on save.
