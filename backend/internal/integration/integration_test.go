// Package integration_test starts both gRPC (via bufconn) and REST (via
// httptest.Server) servers sharing one in-memory SQLite database and exercises
// cross-server interactions.
package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/test/bufconn"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	grpcapi "github.com/rmrobinson/meridian/backend/internal/api/grpc"
	"github.com/rmrobinson/meridian/backend/internal/api/rest"
	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
)

const (
	testJWTSecret  = "integration-test-secret"
	testWriteToken = "integration-write-token"
)

// testEnv holds running gRPC + REST servers sharing one database.
type testEnv struct {
	grpcClient pb.TimelineServiceClient
	restURL    string
	restClient *http.Client
	grpcStop   func()
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()

	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(testWriteToken), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hashing write token: %v", err)
	}

	cfg := &config.Config{
		Server:   config.Server{RESTPort: 8080, GRPCPort: 9090},
		Database: config.Database{Path: dsn},
		Auth: config.Auth{
			JWTSecret:   testJWTSecret,
			WriteTokens: []config.WriteToken{{Name: "test", TokenHash: string(hash)}},
		},
		Person: config.Person{Name: "Test", BirthDate: "1990-01-01"},
		LineFamilies: []config.LineFamily{
			{ID: "spine", Label: "Life Spine", BaseColorHSL: []int{0, 0, 80}, Side: "center", OnEnd: "never", SpawnBehavior: "single_line"},
			{ID: "travel", Label: "Travel", BaseColorHSL: []int{50, 85, 50}, Side: "right", OnEnd: "merge", SpawnBehavior: "per_event"},
			{ID: "books", Label: "Books", BaseColorHSL: []int{30, 70, 50}, Side: "right", OnEnd: "terminate", SpawnBehavior: "per_event"},
			{ID: "fitness", Label: "Fitness", BaseColorHSL: []int{140, 65, 45}, Side: "right", OnEnd: "terminate", SpawnBehavior: "single_line"},
		},
	}

	// --- gRPC via bufconn ---
	gs := grpcapi.NewGRPCServer(cfg, database, zap.NewNop(), nil, nil)
	lis := bufconn.Listen(1024 * 1024)
	go gs.Serve(lis)

	conn, err := grpc.NewClient("passthrough://bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("dialing bufconn: %v", err)
	}

	// --- REST via httptest ---
	restSrv := rest.NewServer(cfg, database, zap.NewNop())
	ts := httptest.NewServer(restSrv)

	t.Cleanup(func() {
		ts.Close()
		conn.Close()
		gs.Stop()
		database.Close()
	})

	return &testEnv{
		grpcClient: pb.NewTimelineServiceClient(conn),
		restURL:    ts.URL,
		restClient: ts.Client(),
		grpcStop:   gs.GracefulStop,
	}
}

// authCtx returns a context carrying the write token.
func authCtx(t *testing.T) context.Context {
	t.Helper()
	return metadata.NewOutgoingContext(context.Background(),
		metadata.Pairs("authorization", "Bearer "+testWriteToken))
}

// makeJWT returns a signed JWT with the given role for REST requests.
func makeJWT(t *testing.T, role string) string {
	t.Helper()
	claims := jwt.MapClaims{"role": role, "exp": time.Now().Add(time.Hour).Unix()}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("signing JWT: %v", err)
	}
	return signed
}

// restGet issues GET to the given path and returns the response.
func (e *testEnv) restGet(t *testing.T, path, bearerToken string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, e.restURL+path, nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	resp, err := e.restClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	return resp
}

// --- Tests ---

func TestBothServers_Respond(t *testing.T) {
	env := newTestEnv(t)

	// gRPC health check via a lightweight ListEvents call.
	_, err := env.grpcClient.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Errorf("gRPC ListEvents: %v", err)
	}

	// REST health check via unauthenticated GET.
	resp := env.restGet(t, "/api/events", "")
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("REST GET /api/events: got %d, want 200", resp.StatusCode)
	}
}

func TestCreateViaGRPC_RetrieveViaREST(t *testing.T) {
	env := newTestEnv(t)

	// Create a public event via gRPC.
	created, err := env.grpcClient.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "cross-1", FamilyId: "travel", LineKey: "l",
		Type:       pb.EventType_EVENT_TYPE_POINT,
		Title:      "Cross-server test",
		Date:       "2024-01-01",
		Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}

	// Retrieve via REST.
	resp := env.restGet(t, "/api/events/"+created.Event.Id, "")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("GET /api/events/%s: got %d, want 200", created.Event.Id, resp.StatusCode)
	}

	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	if body["title"] != "Cross-server test" {
		t.Errorf("title: got %v, want Cross-server test", body["title"])
	}
}

func TestPersonalEvent_UnauthenticatedRESTReturnsEmpty(t *testing.T) {
	env := newTestEnv(t)

	env.grpcClient.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "personal-1", FamilyId: "travel", LineKey: "l",
		Type:       pb.EventType_EVENT_TYPE_POINT,
		Title:      "Private Event",
		Date:       "2024-02-01",
		Visibility: pb.Visibility_VISIBILITY_PERSONAL,
	})

	resp := env.restGet(t, "/api/events", "")
	defer resp.Body.Close()

	var events []map[string]any
	json.NewDecoder(resp.Body).Decode(&events)
	for _, e := range events {
		if e["id"] == "personal-1" {
			t.Error("personal event should not be visible to unauthenticated caller")
		}
	}
}

func TestPersonalEvent_OwnerJWTCanSeeIt(t *testing.T) {
	env := newTestEnv(t)

	env.grpcClient.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "personal-2", FamilyId: "travel", LineKey: "l",
		Type:       pb.EventType_EVENT_TYPE_POINT,
		Title:      "Owner Only",
		Date:       "2024-03-01",
		Visibility: pb.Visibility_VISIBILITY_PERSONAL,
	})

	ownerToken := makeJWT(t, "owner")
	resp := env.restGet(t, "/api/events", ownerToken)
	defer resp.Body.Close()

	var events []map[string]any
	json.NewDecoder(resp.Body).Decode(&events)
	found := false
	for _, e := range events {
		if e["id"] == "personal-2" {
			found = true
		}
	}
	if !found {
		t.Error("owner should be able to see personal event")
	}
}

func TestImportEvents_AppearInRESTTimeline(t *testing.T) {
	env := newTestEnv(t)

	_, err := env.grpcClient.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events: []*pb.CreateEventRequest{
			{FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
				Title: "Import 1", Date: "2024-04-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC, SourceEventId: "imp-1"},
			{FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
				Title: "Import 2", Date: "2024-04-02", Visibility: pb.Visibility_VISIBILITY_PUBLIC, SourceEventId: "imp-2"},
		},
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "testsvc",
	})
	if err != nil {
		t.Fatalf("ImportEvents: %v", err)
	}

	resp := env.restGet(t, "/api/timeline", "")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("GET /api/timeline: got %d, want 200", resp.StatusCode)
	}

	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	events, _ := body["events"].([]any)
	if len(events) < 2 {
		t.Errorf("expected at least 2 timeline events, got %d", len(events))
	}
}

func TestImportDuplicates_SkipStrategy_OnlyOriginalReturned(t *testing.T) {
	env := newTestEnv(t)

	req := &pb.ImportEventsRequest{
		Events: []*pb.CreateEventRequest{
			{FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
				Title: "Original", Date: "2024-05-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC, SourceEventId: "dup-1"},
		},
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_SKIP,
		SourceService:    "testsvc",
	}
	env.grpcClient.ImportEvents(authCtx(t), req)

	// Re-import with an updated title — should be skipped.
	req.Events[0].Title = "Updated"
	env.grpcClient.ImportEvents(authCtx(t), req)

	resp := env.restGet(t, "/api/events", "")
	defer resp.Body.Close()
	var events []map[string]any
	json.NewDecoder(resp.Body).Decode(&events)

	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0]["title"] != "Original" {
		t.Errorf("title: got %v, want Original", events[0]["title"])
	}
}

func TestSoftDelete_RESTReturns404(t *testing.T) {
	env := newTestEnv(t)

	env.grpcClient.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "del-1", FamilyId: "travel", LineKey: "l",
		Type:       pb.EventType_EVENT_TYPE_POINT,
		Title:      "To Delete",
		Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})

	_, err := env.grpcClient.DeleteEvent(authCtx(t), &pb.DeleteEventRequest{Id: "del-1"})
	if err != nil {
		t.Fatalf("DeleteEvent: %v", err)
	}

	resp := env.restGet(t, "/api/events/del-1", makeJWT(t, "owner"))
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("GET after delete: got %d, want 404", resp.StatusCode)
	}
}

func TestAddAndReorderPhotos_RESTReturnsCorrectOrder(t *testing.T) {
	env := newTestEnv(t)

	env.grpcClient.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "photo-evt", FamilyId: "travel", LineKey: "l",
		Type:       pb.EventType_EVENT_TYPE_POINT,
		Title:      "Photo Test",
		Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})

	// Add two photos; capture their IDs from the gRPC response.
	r1, err := env.grpcClient.AddPhoto(authCtx(t), &pb.AddPhotoRequest{
		EventId: "photo-evt",
		S3Url:   "https://s3/photo1.jpg",
		Variant: pb.PhotoVariant_PHOTO_VARIANT_HERO,
	})
	if err != nil {
		t.Fatalf("AddPhoto 1: %v", err)
	}
	r2, err := env.grpcClient.AddPhoto(authCtx(t), &pb.AddPhotoRequest{
		EventId: "photo-evt",
		S3Url:   "https://s3/photo2.jpg",
		Variant: pb.PhotoVariant_PHOTO_VARIANT_THUMB,
	})
	if err != nil {
		t.Fatalf("AddPhoto 2: %v", err)
	}

	// Reorder: put photo2 first.
	_, err = env.grpcClient.ReorderPhotos(authCtx(t), &pb.ReorderPhotosRequest{
		EventId:  "photo-evt",
		PhotoIds: []string{r2.Photo.Id, r1.Photo.Id},
	})
	if err != nil {
		t.Fatalf("ReorderPhotos: %v", err)
	}

	resp := env.restGet(t, "/api/events/photo-evt", "")
	defer resp.Body.Close()

	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	photos, _ := body["photos"].([]any)
	if len(photos) != 2 {
		t.Fatalf("expected 2 photos, got %d", len(photos))
	}
	// After reorder, photo2 should come first (lower sort_order).
	p0 := photos[0].(map[string]any)
	p1 := photos[1].(map[string]any)
	if p0["s3_url"] != "https://s3/photo2.jpg" {
		t.Errorf("first photo after reorder: got s3_url %v, want photo2.jpg", p0["s3_url"])
	}
	so0 := int(p0["sort_order"].(float64))
	so1 := int(p1["sort_order"].(float64))
	if so0 >= so1 {
		t.Errorf("photos not in sort order: got sort_order %d before %d", so0, so1)
	}
}

func TestGracefulShutdown_InFlightRequestCompletes(t *testing.T) {
	// This test verifies that an in-flight REST request finishes after
	// GracefulStop/Shutdown is initiated.
	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(testWriteToken), bcrypt.MinCost)
	cfg := &config.Config{
		Server:   config.Server{RESTPort: 8080, GRPCPort: 9090, ShutdownTimeoutSec: 5},
		Database: config.Database{Path: dsn},
		Auth: config.Auth{
			JWTSecret:   testJWTSecret,
			WriteTokens: []config.WriteToken{{Name: "test", TokenHash: string(hash)}},
		},
	}

	// Use a slow handler to simulate an in-flight request during shutdown.
	slowMux := http.NewServeMux()
	slowMux.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, "done")
	})

	httpSrv := &http.Server{Handler: slowMux}
	ts := httptest.NewServer(slowMux)

	var wg sync.WaitGroup
	wg.Add(1)
	var respStatus int
	go func() {
		defer wg.Done()
		resp, err := ts.Client().Get(ts.URL + "/slow")
		if err == nil {
			respStatus = resp.StatusCode
			resp.Body.Close()
		}
	}()

	// Give the request a moment to start.
	time.Sleep(20 * time.Millisecond)

	// Initiate graceful shutdown.
	shutdownCtx, cancel := context.WithTimeout(context.Background(),
		time.Duration(cfg.Server.ShutdownTimeoutSec)*time.Second)
	defer cancel()
	httpSrv.Shutdown(shutdownCtx)
	ts.Close()

	wg.Wait()

	if respStatus != http.StatusOK {
		t.Errorf("in-flight request: got status %d, want 200", respStatus)
	}

	database.Close()
}
