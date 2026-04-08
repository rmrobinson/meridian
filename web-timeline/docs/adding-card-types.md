# Adding a New Card Type

## Overview

Cards are rendered based on `event.metadata_type`, not `event.family_id`. These are
independent concerns:

- **`family_id`** — which visual lane an event is placed on (controlled by line family config).
- **`metadata_type`** — what structured data the event carries and therefore what card to render.

`metadata_type` is written to the database at create/update time, derived from the gRPC
`oneof metadata` arm — the only point in the system where the type is unambiguous. It flows
through the REST API as a plain string field and is read directly by the frontend with no
inference logic.

This means a flight event reassigned to a travel lane (by `resolveFlights()`) still renders
a flight card, because `metadata_type` is stable.

---

## Step 1 — Define the backend metadata struct

Add a struct to `backend/internal/domain/metadata.go`:

```go
type ConcertMetadata struct {
    MainAct     string           `json:"main_act,omitempty"`
    OpeningActs []string         `json:"opening_acts,omitempty"`
    Venue       *ConcertLocation `json:"venue,omitempty"`
    PlaylistURL string           `json:"playlist_url,omitempty"`
}
```

Naming convention: `XxxMetadata`, fields use snake_case JSON tags.

---

## Step 2 — Add a proto message and register it in the oneof

In `proto/meridian/v1/timeline.proto`, add the message and register it in all three `oneof
metadata` blocks (`Event`, `CreateEventRequest`, `UpdateEventRequest`):

```protobuf
message ConcertMetadata {
  string main_act = 1;
  repeated string opening_acts = 2;
  Location venue = 3;
  string playlist_url = 4;
}

// In Event, CreateEventRequest, UpdateEventRequest:
oneof metadata {
  // ... existing arms ...
  ConcertMetadata concert_metadata = 31;
}
```

Run `./generate.sh` from the repo root after any `.proto` change.

Add the proto↔domain conversion helpers to `backend/internal/api/grpc/mapping.go` following
the existing patterns (`protoToConcertMetadata`, `domainConcertToProto`).

---

## Step 3 — Register the metadata_type in `extractCreateMetadata` / `extractUpdateMetadata`

In `backend/internal/api/grpc/mapping.go`, add a case to both functions returning the JSON
string **and** the type name:

```go
case *pb.CreateEventRequest_ConcertMetadata:
    return marshalMetadata(protoToConcertMetadata(v.ConcertMetadata)), "concert"
```

This is the single point where the type is captured. The string `"concert"` is what will be
stored in the `metadata_type` DB column and returned by the REST API.

Do the same in `extractUpdateMetadata`.

---

## Step 4 — Handle the type in `jsonToEventMetadata`

In `jsonToEventMetadata` (same file), add a case for the new type:

```go
case "concert":
    m, err := domain.ParseMetadata[domain.ConcertMetadata](e)
    if err != nil { return }
    out.Metadata = &pb.Event_ConcertMetadata{ConcertMetadata: domainConcertToProto(m)}
```

This ensures the gRPC read path returns typed metadata independently of `family_id`.

---

## Step 5 — The REST API requires no changes

`metadata_type` is populated in `toEventResponse()` directly from `e.MetadataType`. No
logic changes are needed.

---

## Step 6 — Add a sample event to the mock fixture

Add a realistic event with the new `family_id` and `"metadata_type"` to
`web-timeline/app/tests/fixtures/mock-timeline.json`:

```json
{
  "id": "evt_concert_001",
  "family_id": "hobbies",
  "metadata_type": "concert",
  "line_key": "glastonbury-2023",
  "type": "point",
  "title": "Glastonbury Festival",
  "icon": "mdi:music",
  "date": "2023-06-23",
  "metadata": {
    "main_act": "Arctic Monkeys",
    "opening_acts": ["Fontaines D.C."],
    "venue": { "label": "Worthy Farm, Somerset" }
  }
}
```

The `metadata_type` field in the fixture is what the real REST API will return once events
are created via gRPC. The frontend reads it directly.

---

## Step 7 — Write the card builder in `cards.js`

In `web-timeline/app/js/cards.js`:

```js
function concertCard(event) {
  const wrap = el('div', 'card--concert');
  appendShared(wrap, event);                    // title, dates, description, location

  const { main_act, opening_acts, venue, playlist_url } = event.metadata ?? {};
  if (main_act) wrap.appendChild(el('p', 'card-main-act', main_act));
  if (opening_acts?.length > 0)
    wrap.appendChild(el('p', 'card-opening-acts', opening_acts.join(' · ')));
  if (venue?.label) wrap.appendChild(el('p', 'card-venue', venue.label));

  appendGallery(wrap, event.photos);            // shared gallery helper

  if (playlist_url) {
    const link = document.createElement('a');
    link.className = 'card-playlist';
    link.href = playlist_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View playlist →';
    wrap.appendChild(link);
  }
  return wrap;
}
```

Reference `employmentCard` for simple cases; `fitnessCard` for activity-discriminated
sub-sections (switch on a metadata field to render type-specific fields).

---

## Step 8 — Register the builder in `buildCardContent()`

Add a case to the switch in `buildCardContent()`:

```js
case 'concert': return concertCard(event);
```

The `aggregate` guard at the top is never displaced — all other dispatch goes through the
switch.

---

## Step 9 — Update `FAMILY_LABELS` if the family is new

`FAMILY_LABELS` at the bottom of `cards.js` is used only by `buildWeekCardContent()` to
group events in week-summary cards. If you're adding a new `family_id`, add it here:

```js
const FAMILY_LABELS = {
  // ...
  concerts: 'Concerts',
};
```

---

## Step 10 — Write tests

### `web-timeline/app/tests/unit/cards.test.js`

Add a `describe('concert card', ...)` block covering:
- Dispatch: `metadata_type: 'concert'` produces `card--concert`.
- Each rendered metadata field (positive case + absent/null case).

### `web-timeline/app/tests/unit/api.test.js`

Add a test verifying that an event with `metadata_type: 'concert'` in the raw payload
passes through `normalize()` unchanged:

```js
it('passes metadata_type: concert through normalizeEvent', () => {
  const result = normalize(rawEvent({ metadata_type: 'concert' }));
  expect(result.events.find((e) => e.id === 'e1').metadata_type).toBe('concert');
});
```

---

## Reference: current metadata_type registry

| `metadata_type` | gRPC oneof arm | Backend struct | `cards.js` builder |
|---|---|---|---|
| `life` | `LifeMetadata` | `domain.LifeMetadata` | `milestoneCard` |
| `employment` | `EmploymentMetadata` | `domain.EmploymentMetadata` | `employmentCard` |
| `education` | `EducationMetadata` | `domain.EducationMetadata` | `educationCard` |
| `travel` | `TravelMetadata` | `domain.TravelMetadata` | `travelCard` |
| `flight` | `FlightMetadata` | `domain.FlightMetadata` | `flightCard` |
| `book` | `BookMetadata` | `domain.BookMetadata` | `bookCard` |
| `film_tv` | `FilmTVMetadata` | `domain.FilmTVMetadata` | `filmTvCard` |
| `fitness` | `FitnessMetadata` | `domain.FitnessMetadata` | `fitnessCard` |
| `concert` | `ConcertMetadata` | `domain.ConcertMetadata` | `concertCard` |
| *(none)* | — | — | `standardCard` |

Keep this table in sync when adding new types.
