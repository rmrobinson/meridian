package rest_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/rmrobinson/meridian/backend/internal/api/rest"
	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
	"github.com/rmrobinson/meridian/backend/internal/sharing"
	"go.uber.org/zap"
)

// testEnv holds all the pieces needed for API tests.
type testEnv struct {
	server       *httptest.Server
	db           *db.DB
	sharingStore *sharing.Store
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	return newTestEnvWithConfig(t, testConfig())
}

func newTestEnvWithConfig(t *testing.T, cfg *config.Config) *testEnv {
	t.Helper()

	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}

	logger := zap.NewNop()
	sharingStore := sharing.NewStore(database)
	srv := rest.NewServer(cfg, database, sharingStore, logger)
	ts := httptest.NewServer(srv)

	t.Cleanup(func() {
		ts.Close()
		database.Close()
	})

	return &testEnv{server: ts, db: database, sharingStore: sharingStore}
}

func testConfig() *config.Config {
	return &config.Config{
		Server: config.Server{RESTPort: 8080, GRPCPort: 9090},
		Database: config.Database{Path: ":memory:"},
		Auth: config.Auth{
			JWTSecret: testSecret,
			WriteTokens: []config.WriteToken{
				{Name: "test", TokenHash: "$2a$10$placeholder"},
			},
		},
		Person: config.Person{Name: "Test User", BirthDate: "1990-01-01", TimelineStart: "1990-01-01"},
		LineFamilies: []config.LineFamily{
			{ID: "spine", Label: "Life Spine", BaseColorHSL: []int{0, 0, 80}, Side: "center", OnEnd: "never", SpawnBehavior: "single_line"},
			{ID: "travel", Label: "Travel", BaseColorHSL: []int{50, 85, 50}, Side: "right", OnEnd: "merge", SpawnBehavior: "per_event"},
			{ID: "books", Label: "Books", BaseColorHSL: []int{30, 70, 50}, Side: "right", OnEnd: "terminate", SpawnBehavior: "per_event", ParentFamilyID: "hobbies"},
			{ID: "employment", Label: "Employment", BaseColorHSL: []int{210, 70, 50}, Side: "left", OnEnd: "merge", SpawnBehavior: "per_event"},
			{ID: "education", Label: "Education", BaseColorHSL: []int{270, 60, 55}, Side: "left", OnEnd: "merge", SpawnBehavior: "per_event"},
			{ID: "hobbies", Label: "Hobbies", BaseColorHSL: []int{180, 55, 45}, Side: "right", OnEnd: "terminate", SpawnBehavior: "secondary_spine"},
			{ID: "film_tv", Label: "Film & TV", BaseColorHSL: []int{300, 60, 55}, Side: "right", OnEnd: "terminate", SpawnBehavior: "per_event", ParentFamilyID: "hobbies"},
			{ID: "fitness", Label: "Fitness & Health", BaseColorHSL: []int{140, 65, 45}, Side: "left", OnEnd: "terminate", SpawnBehavior: "secondary_spine"},
		},
	}
}

func makeJWT(t *testing.T, role string) string {
	t.Helper()
	claims := jwt.MapClaims{"role": role, "exp": time.Now().Add(time.Hour).Unix()}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("signing JWT: %v", err)
	}
	return signed
}

func seedEvent(t *testing.T, d *db.DB, id, familyID, dateStr string, vis domain.Visibility) *domain.Event {
	t.Helper()
	now := time.Now().UTC()
	e := &domain.Event{
		ID:         id,
		FamilyID:   familyID,
		LineKey:    familyID + "-" + id,
		Type:       domain.EventTypePoint,
		Title:      "Event " + id,
		Date:       &dateStr,
		Visibility: vis,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := d.CreateEvent(context.Background(), e); err != nil {
		t.Fatalf("seeding event %s: %v", id, err)
	}
	return e
}

func get(t *testing.T, ts *httptest.Server, path, token string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, ts.URL+path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	return resp
}

func decodeJSON(t *testing.T, r io.Reader, v any) {
	t.Helper()
	if err := json.NewDecoder(r).Decode(v); err != nil {
		t.Fatalf("decoding JSON: %v", err)
	}
}

// --- GET /api/lines ---

func TestGetLines_Returns200WithCorrectContentType(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/lines", "")
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}
}

func TestGetLines_ReturnsAllNineFamilies(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/lines", "")
	var families []map[string]any
	decodeJSON(t, resp.Body, &families)
	if len(families) != 8 {
		t.Errorf("family count: got %d, want 8", len(families))
	}
	// Spot-check first family fields are present
	first := families[0]
	for _, field := range []string{"id", "label", "base_color_hsl", "side", "on_end", "spawn_behavior"} {
		if _, ok := first[field]; !ok {
			t.Errorf("missing field %q in family response", field)
		}
	}
}

// --- GET /api/events ---

func TestGetEvents_UnauthenticatedSeesOnlyPublic(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "pub", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "priv", "travel", "2023-01-02", domain.VisibilityPersonal)

	resp := get(t, env.server, "/api/events", "")
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 || events[0]["id"] != "pub" {
		t.Errorf("expected only public event, got %v ids", eventIDsFromMaps(events))
	}
}

func TestGetEvents_FriendsJWTSeesPublicAndFriends(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "pub", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "fri", "travel", "2023-01-02", domain.VisibilityFriends)
	seedEvent(t, env.db, "fam", "travel", "2023-01-03", domain.VisibilityFamily)

	resp := get(t, env.server, "/api/events", makeJWT(t, "friends"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 2 {
		t.Errorf("expected 2 events, got %d: %v", len(events), eventIDsFromMaps(events))
	}
}

func TestGetEvents_FamilyJWTSeesUpToFamily(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "pub", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "fri", "travel", "2023-01-02", domain.VisibilityFriends)
	seedEvent(t, env.db, "fam", "travel", "2023-01-03", domain.VisibilityFamily)
	seedEvent(t, env.db, "per", "travel", "2023-01-04", domain.VisibilityPersonal)

	resp := get(t, env.server, "/api/events", makeJWT(t, "family"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 3 {
		t.Errorf("expected 3 events, got %d: %v", len(events), eventIDsFromMaps(events))
	}
}

func TestGetEvents_OwnerJWTSeesAll(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "pub", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "fri", "travel", "2023-01-02", domain.VisibilityFriends)
	seedEvent(t, env.db, "fam", "travel", "2023-01-03", domain.VisibilityFamily)
	seedEvent(t, env.db, "per", "travel", "2023-01-04", domain.VisibilityPersonal)

	resp := get(t, env.server, "/api/events", makeJWT(t, "owner"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 4 {
		t.Errorf("expected 4 events, got %d: %v", len(events), eventIDsFromMaps(events))
	}
}

func TestGetEvents_FilterByFamily(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "t1", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "b1", "books", "2023-01-02", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events?family=travel", "")
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 || events[0]["id"] != "t1" {
		t.Errorf("expected only travel event, got %v", eventIDsFromMaps(events))
	}
}

func TestGetEvents_FilterFromDate(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "old", "travel", "2020-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "new", "travel", "2023-06-01", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events?from=2022-01-01", "")
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 || events[0]["id"] != "new" {
		t.Errorf("expected only new event, got %v", eventIDsFromMaps(events))
	}
}

func TestGetEvents_FilterToDate(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "old", "travel", "2020-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "new", "travel", "2023-06-01", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events?to=2021-01-01", "")
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 || events[0]["id"] != "old" {
		t.Errorf("expected only old event, got %v", eventIDsFromMaps(events))
	}
}

func TestGetEvents_FilterFromAndTo(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "e2020", "travel", "2020-06-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "e2021", "travel", "2021-06-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "e2022", "travel", "2022-06-01", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events?from=2021-01-01&to=2021-12-31", "")
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 || events[0]["id"] != "e2021" {
		t.Errorf("expected only e2021, got %v", eventIDsFromMaps(events))
	}
}

func TestGetEvents_SoftDeletedNotReturned(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "live", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "dead", "travel", "2023-01-02", domain.VisibilityPublic)
	env.db.SoftDeleteEvent(context.Background(), "dead")

	resp := get(t, env.server, "/api/events", makeJWT(t, "owner"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	for _, e := range events {
		if e["id"] == "dead" {
			t.Error("soft-deleted event should not appear")
		}
	}
}

func TestGetEvents_NonCanonicalNotReturned(t *testing.T) {
	env := newTestEnv(t)
	canon := seedEvent(t, env.db, "canon", "travel", "2023-01-01", domain.VisibilityPublic)
	linked := seedEvent(t, env.db, "linked", "travel", "2023-01-01", domain.VisibilityPublic)
	linked.CanonicalID = &canon.ID
	env.db.UpdateEvent(context.Background(), linked)

	resp := get(t, env.server, "/api/events", makeJWT(t, "owner"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 || events[0]["id"] != "canon" {
		t.Errorf("expected only canonical event, got %v", eventIDsFromMaps(events))
	}
}

// --- GET /api/events/:id ---

func TestGetEventByID_ReturnsEventWithPhotos(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "evt-photos", "travel", "2023-01-01", domain.VisibilityPublic)
	env.db.AddPhoto(context.Background(), &domain.Photo{
		ID: "p1", EventID: "evt-photos", S3URL: "https://s3.example.com/p1.jpg",
		Variant: domain.PhotoVariantOriginal, SortOrder: 0,
	})
	env.db.AddPhoto(context.Background(), &domain.Photo{
		ID: "p2", EventID: "evt-photos", S3URL: "https://s3.example.com/p2.jpg",
		Variant: domain.PhotoVariantThumb, SortOrder: 1,
	})

	resp := get(t, env.server, "/api/events/evt-photos", "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: got %d, want 200", resp.StatusCode)
	}
	var event map[string]any
	decodeJSON(t, resp.Body, &event)
	if event["id"] != "evt-photos" {
		t.Errorf("id: got %v, want evt-photos", event["id"])
	}
	photos, _ := event["photos"].([]any)
	if len(photos) != 2 {
		t.Errorf("photos: got %d, want 2", len(photos))
	}
}

func TestGetEventByID_NotFound(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/events/does-not-exist", "")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status: got %d, want 404", resp.StatusCode)
	}
}

func TestGetEventByID_SoftDeletedReturns404(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "soft-del", "travel", "2023-01-01", domain.VisibilityPublic)
	env.db.SoftDeleteEvent(context.Background(), "soft-del")

	resp := get(t, env.server, "/api/events/soft-del", "")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status: got %d, want 404", resp.StatusCode)
	}
}

func TestGetEventByID_PersonalEventUnauthenticatedReturns403(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "personal", "travel", "2023-01-01", domain.VisibilityPersonal)

	resp := get(t, env.server, "/api/events/personal", "")
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status: got %d, want 403", resp.StatusCode)
	}
}

func TestGetEventByID_FamilyEventWithFriendsJWTReturns403(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "fam-only", "travel", "2023-01-01", domain.VisibilityFamily)

	resp := get(t, env.server, "/api/events/fam-only", makeJWT(t, "friends"))
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status: got %d, want 403", resp.StatusCode)
	}
}

func TestGetEventByID_PhotosInSortOrder(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "ordered", "travel", "2023-01-01", domain.VisibilityPublic)
	env.db.AddPhoto(context.Background(), &domain.Photo{ID: "px", EventID: "ordered", S3URL: "https://s3/px.jpg", Variant: domain.PhotoVariantOriginal, SortOrder: 2})
	env.db.AddPhoto(context.Background(), &domain.Photo{ID: "py", EventID: "ordered", S3URL: "https://s3/py.jpg", Variant: domain.PhotoVariantOriginal, SortOrder: 0})
	env.db.AddPhoto(context.Background(), &domain.Photo{ID: "pz", EventID: "ordered", S3URL: "https://s3/pz.jpg", Variant: domain.PhotoVariantOriginal, SortOrder: 1})

	resp := get(t, env.server, "/api/events/ordered", "")
	var event map[string]any
	decodeJSON(t, resp.Body, &event)
	photos, _ := event["photos"].([]any)
	wantOrder := []string{"py", "pz", "px"}
	for i, want := range wantOrder {
		p, _ := photos[i].(map[string]any)
		if p["id"] != want {
			t.Errorf("photos[%d]: got %v, want %v", i, p["id"], want)
		}
	}
}

// --- GET /api/timeline ---

func TestGetTimeline_ReturnsPersonFromConfig(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/timeline", makeJWT(t, "owner"))
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	person, _ := tl["person"].(map[string]any)
	if person["name"] != "Test User" {
		t.Errorf("person.name: got %v, want Test User", person["name"])
	}
	if person["birth_date"] != "1990-01-01" {
		t.Errorf("person.birth_date: got %v, want 1990-01-01", person["birth_date"])
	}
	if person["timeline_start"] != "1990-01-01" {
		t.Errorf("person.timeline_start: got %v, want 1990-01-01", person["timeline_start"])
	}
}

func TestGetTimeline_TimelineStartDiffersFromBirthDateWhenConfigured(t *testing.T) {
	cfg := testConfig()
	cfg.Person.BirthDate = "1990-04-12"
	cfg.Person.TimelineStart = "1990-01-01"
	env := newTestEnvWithConfig(t, cfg)

	resp := get(t, env.server, "/api/timeline", makeJWT(t, "owner"))
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	person, _ := tl["person"].(map[string]any)
	if person["birth_date"] != "1990-04-12" {
		t.Errorf("birth_date: got %v, want 1990-04-12", person["birth_date"])
	}
	if person["timeline_start"] != "1990-01-01" {
		t.Errorf("timeline_start: got %v, want 1990-01-01", person["timeline_start"])
	}
}

func TestGetTimeline_TimelineStartFallsBackToBirthDateWhenNotConfigured(t *testing.T) {
	cfg := testConfig()
	cfg.Person.BirthDate = "1990-04-12"
	cfg.Person.TimelineStart = ""
	env := newTestEnvWithConfig(t, cfg)

	resp := get(t, env.server, "/api/timeline", makeJWT(t, "owner"))
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	person, _ := tl["person"].(map[string]any)
	if person["timeline_start"] != "1990-04-12" {
		t.Errorf("timeline_start fallback: got %v, want 1990-04-12", person["timeline_start"])
	}
}

func TestGetTimeline_PublicCallerHasTimelineStartButNoBirthDate(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/timeline", "")
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	person, _ := tl["person"].(map[string]any)
	if person["timeline_start"] != "1990-01-01" {
		t.Errorf("public: timeline_start: got %v, want 1990-01-01", person["timeline_start"])
	}
	if bd := person["birth_date"]; bd != "" && bd != nil {
		t.Errorf("public: birth_date should be empty, got %v", bd)
	}
}

func TestGetTimeline_ReturnsAllNineFamilies(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/timeline", "")
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	families, _ := tl["line_families"].([]any)
	if len(families) != 8 {
		t.Errorf("families: got %d, want 8", len(families))
	}
}

func TestGetTimeline_EventsFilteredByVisibility(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "pub", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "per", "travel", "2023-01-02", domain.VisibilityPersonal)

	resp := get(t, env.server, "/api/timeline", "")
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	events, _ := tl["events"].([]any)
	if len(events) != 1 {
		t.Errorf("unauthenticated timeline: expected 1 event, got %d", len(events))
	}

	resp2 := get(t, env.server, "/api/timeline", makeJWT(t, "owner"))
	var tl2 map[string]any
	decodeJSON(t, resp2.Body, &tl2)
	events2, _ := tl2["events"].([]any)
	if len(events2) != 2 {
		t.Errorf("owner timeline: expected 2 events, got %d", len(events2))
	}
}

func TestGetTimeline_EachEventIncludesPhotos(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "with-photo", "travel", "2023-01-01", domain.VisibilityPublic)
	env.db.AddPhoto(context.Background(), &domain.Photo{
		ID: "tp1", EventID: "with-photo", S3URL: "https://s3/tp1.jpg",
		Variant: domain.PhotoVariantOriginal, SortOrder: 0,
	})

	resp := get(t, env.server, "/api/timeline", "")
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	events, _ := tl["events"].([]any)
	if len(events) == 0 {
		t.Fatal("expected at least one event")
	}
	e, _ := events[0].(map[string]any)
	photos, _ := e["photos"].([]any)
	if len(photos) != 1 {
		t.Errorf("expected 1 photo on event, got %d", len(photos))
	}
}

func eventIDsFromMaps(events []map[string]any) []any {
	ids := make([]any, len(events))
	for i, e := range events {
		ids[i] = e["id"]
	}
	return ids
}

// --- metadata_type field ---

func seedEventWithMetadataType(t *testing.T, d *db.DB, id, familyID, metadataType, dateStr string, vis domain.Visibility) *domain.Event {
	t.Helper()
	now := time.Now().UTC()
	e := &domain.Event{
		ID:           id,
		FamilyID:     familyID,
		LineKey:      familyID + "-" + id,
		Type:         domain.EventTypePoint,
		Title:        "Event " + id,
		Date:         &dateStr,
		MetadataType: &metadataType,
		Visibility:   vis,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := d.CreateEvent(context.Background(), e); err != nil {
		t.Fatalf("seeding event %s: %v", id, err)
	}
	return e
}

func TestGetEvents_MetadataTypeIncludedInResponse(t *testing.T) {
	env := newTestEnv(t)
	seedEventWithMetadataType(t, env.db, "flight-evt", "flights", "flight", "2023-03-10", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events", makeJWT(t, "owner"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if got := events[0]["metadata_type"]; got != "flight" {
		t.Errorf("metadata_type: got %v, want flight", got)
	}
}

func TestGetEvents_MetadataTypeOmittedWhenEmpty(t *testing.T) {
	env := newTestEnv(t)
	seedEvent(t, env.db, "no-meta", "travel", "2023-03-10", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events", makeJWT(t, "owner"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	// metadata_type should be absent (omitempty) when not set
	if _, present := events[0]["metadata_type"]; present {
		t.Errorf("metadata_type should be omitted when empty, but key was present")
	}
}

func TestGetEventByID_MetadataTypeIncludedInResponse(t *testing.T) {
	env := newTestEnv(t)
	seedEventWithMetadataType(t, env.db, "book-evt", "books", "book", "2023-01-01", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events/book-evt", "")
	var event map[string]any
	decodeJSON(t, resp.Body, &event)
	if got := event["metadata_type"]; got != "book" {
		t.Errorf("metadata_type: got %v, want book", got)
	}
}

// --- Sharing token middleware tests ---

// makeSharingJWT creates a signed sharing JWT for a token that already exists
// in the DB (created via sharingStore.Create).
func makeSharingJWT(t *testing.T, tok *sharing.SharingToken) string {
	t.Helper()
	signed, err := sharing.Issue(tok, []byte(testSecret))
	if err != nil {
		t.Fatalf("issuing sharing JWT: %v", err)
	}
	return signed
}

func TestJWTMiddleware_SharingToken_ValidFriends(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	// Seed a public and a friends event; sharing token grants friends visibility.
	seedEvent(t, env.db, "pub-s", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "fri-s", "travel", "2023-01-02", domain.VisibilityFriends)
	seedEvent(t, env.db, "per-s", "travel", "2023-01-03", domain.VisibilityPersonal)

	tok := &sharing.SharingToken{
		ID:         "share-friends",
		Name:       "Alice",
		Email:      "alice@example.com",
		Visibility: domain.VisibilityFriends,
		CreatedAt:  time.Now().UTC(),
	}
	if err := env.sharingStore.Create(ctx, tok); err != nil {
		t.Fatalf("creating sharing token: %v", err)
	}

	resp := get(t, env.server, "/api/events", makeSharingJWT(t, tok))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)

	ids := eventIDsFromMaps(events)
	if len(events) != 2 {
		t.Errorf("expected 2 events (public+friends), got %d: %v", len(events), ids)
	}
	for _, e := range events {
		if e["id"] == "per-s" {
			t.Error("personal event should not be visible with friends sharing token")
		}
	}
}

func TestJWTMiddleware_SharingToken_Revoked(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	seedEvent(t, env.db, "pub-r", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "fri-r", "travel", "2023-01-02", domain.VisibilityFriends)

	tok := &sharing.SharingToken{
		ID:         "share-revoked",
		Name:       "Bob",
		Email:      "bob@example.com",
		Visibility: domain.VisibilityFriends,
		CreatedAt:  time.Now().UTC(),
	}
	if err := env.sharingStore.Create(ctx, tok); err != nil {
		t.Fatalf("creating sharing token: %v", err)
	}
	jwtStr := makeSharingJWT(t, tok)

	if err := env.sharingStore.Revoke(ctx, tok.ID); err != nil {
		t.Fatalf("revoking sharing token: %v", err)
	}

	resp := get(t, env.server, "/api/events", jwtStr)
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)

	// Revoked token: treated as unauthenticated — only public events.
	if len(events) != 1 || events[0]["id"] != "pub-r" {
		t.Errorf("expected only public event after revocation, got %v", eventIDsFromMaps(events))
	}
}

func TestJWTMiddleware_SharingToken_ExpiredInDB(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	seedEvent(t, env.db, "pub-e", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "fri-e", "travel", "2023-01-02", domain.VisibilityFriends)

	// DB row has expires_at in the past; JWT itself has a future exp.
	past := time.Now().Add(-time.Hour)
	tok := &sharing.SharingToken{
		ID:         "share-db-expired",
		Name:       "Carol",
		Email:      "carol@example.com",
		Visibility: domain.VisibilityFriends,
		CreatedAt:  time.Now().Add(-2 * time.Hour).UTC(),
		ExpiresAt:  &past,
	}
	if err := env.sharingStore.Create(ctx, tok); err != nil {
		t.Fatalf("creating sharing token: %v", err)
	}

	// Issue a JWT with a future exp so it would pass JWT-only validation.
	future := time.Now().Add(time.Hour)
	tok.ExpiresAt = &future
	jwtStr := makeSharingJWT(t, tok)

	resp := get(t, env.server, "/api/events", jwtStr)
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)

	// DB row expired: treated as unauthenticated — only public events.
	if len(events) != 1 || events[0]["id"] != "pub-e" {
		t.Errorf("expected only public event for DB-expired token, got %v", eventIDsFromMaps(events))
	}
}

func TestJWTMiddleware_SharingToken_UnknownJTI(t *testing.T) {
	env := newTestEnv(t)

	seedEvent(t, env.db, "pub-u", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "fri-u", "travel", "2023-01-02", domain.VisibilityFriends)

	// Issue a JWT for a token that doesn't exist in the DB.
	tok := &sharing.SharingToken{
		ID:         "ghost-id",
		Name:       "Ghost",
		Email:      "ghost@example.com",
		Visibility: domain.VisibilityFriends,
		CreatedAt:  time.Now().UTC(),
	}
	jwtStr := makeSharingJWT(t, tok)

	resp := get(t, env.server, "/api/events", jwtStr)
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)

	if len(events) != 1 || events[0]["id"] != "pub-u" {
		t.Errorf("expected only public event for unknown JTI, got %v", eventIDsFromMaps(events))
	}
}

func TestJWTMiddleware_OwnerJWT_StillWorks(t *testing.T) {
	env := newTestEnv(t)

	seedEvent(t, env.db, "pub-o", "travel", "2023-01-01", domain.VisibilityPublic)
	seedEvent(t, env.db, "per-o", "travel", "2023-01-02", domain.VisibilityPersonal)

	resp := get(t, env.server, "/api/events", makeJWT(t, "owner"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)

	if len(events) != 2 {
		t.Errorf("owner JWT: expected 2 events, got %d: %v", len(events), eventIDsFromMaps(events))
	}
}

// --- Life event milestone-type visibility gating ---

func seedLifeEvent(t *testing.T, d *db.DB, id, milestoneType string, vis domain.Visibility) *domain.Event {
	t.Helper()
	mt := "life"
	meta := fmt.Sprintf(`{"milestone_type":%q}`, milestoneType)
	now := time.Now().UTC()
	date := "2023-06-01"
	e := &domain.Event{
		ID:           id,
		FamilyID:     "spine",
		LineKey:      "spine",
		Type:         domain.EventTypePoint,
		Title:        "Life event " + id,
		Date:         &date,
		MetadataType: &mt,
		Metadata:     &meta,
		Visibility:   vis,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := d.CreateEvent(context.Background(), e); err != nil {
		t.Fatalf("seeding life event %s: %v", id, err)
	}
	return e
}

func TestGetEvents_PublicCallerSeesRelocationAndGraduationButNotRestrictedLifeEvents(t *testing.T) {
	env := newTestEnv(t)
	seedLifeEvent(t, env.db, "birth-evt", "birth", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "death-evt", "death", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "marriage-evt", "marriage", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "anniversary-evt", "anniversary", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "relocation-evt", "relocation", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "graduation-evt", "graduation", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events", "")
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)

	ids := eventIDsFromMaps(events)
	if len(events) != 2 {
		t.Errorf("public caller: expected 2 events (relocation + graduation), got %d: %v", len(events), ids)
	}
	for _, e := range events {
		id := e["id"]
		if id != "relocation-evt" && id != "graduation-evt" {
			t.Errorf("public caller: unexpected event id %v in response", id)
		}
	}
}

func TestGetEvents_FriendsCallerSeesAllLifeEventTypes(t *testing.T) {
	env := newTestEnv(t)
	seedLifeEvent(t, env.db, "birth-f", "birth", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "death-f", "death", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "marriage-f", "marriage", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "anniversary-f", "anniversary", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "relocation-f", "relocation", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "graduation-f", "graduation", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events", makeJWT(t, "friends"))
	var events []map[string]any
	decodeJSON(t, resp.Body, &events)

	if len(events) != 6 {
		t.Errorf("friends caller: expected 6 events, got %d: %v", len(events), eventIDsFromMaps(events))
	}
}

func TestGetEventByID_RestrictedLifeEventPublicCallerReturns403(t *testing.T) {
	env := newTestEnv(t)
	seedLifeEvent(t, env.db, "marriage-pub", "marriage", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events/marriage-pub", "")
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status: got %d, want 403", resp.StatusCode)
	}
}

func TestGetEventByID_RestrictedLifeEventFriendsCallerReturns200(t *testing.T) {
	env := newTestEnv(t)
	seedLifeEvent(t, env.db, "marriage-fri", "marriage", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/events/marriage-fri", makeJWT(t, "friends"))
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
}

func TestGetTimeline_PublicCallerOmitsBirthDate(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/timeline", "")
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	person, _ := tl["person"].(map[string]any)
	if bd := person["birth_date"]; bd != "" && bd != nil {
		t.Errorf("public caller: birth_date should be empty, got %v", bd)
	}
}

func TestGetTimeline_FriendsCallerIncludesBirthDate(t *testing.T) {
	env := newTestEnv(t)
	resp := get(t, env.server, "/api/timeline", makeJWT(t, "friends"))
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	person, _ := tl["person"].(map[string]any)
	if person["birth_date"] != "1990-01-01" {
		t.Errorf("friends caller: birth_date: got %v, want 1990-01-01", person["birth_date"])
	}
}

func TestGetTimeline_PublicCallerFiltersRestrictedLifeEvents(t *testing.T) {
	env := newTestEnv(t)
	seedLifeEvent(t, env.db, "tl-marriage", "marriage", domain.VisibilityPublic)
	seedLifeEvent(t, env.db, "tl-relocation", "relocation", domain.VisibilityPublic)

	resp := get(t, env.server, "/api/timeline", "")
	var tl map[string]any
	decodeJSON(t, resp.Body, &tl)
	events, _ := tl["events"].([]any)
	if len(events) != 1 {
		t.Errorf("public timeline: expected 1 event (relocation only), got %d: %v", len(events), events)
	}
	e, _ := events[0].(map[string]any)
	if e["id"] != "tl-relocation" {
		t.Errorf("public timeline: expected relocation event, got %v", e["id"])
	}
}
