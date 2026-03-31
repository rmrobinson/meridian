package grpc_test

import (
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	grpcapi "github.com/rmrobinson/meridian/backend/internal/api/grpc"
	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
	"go.uber.org/zap"
)

// mockEnricher is a configurable domain.Enricher for tests.
type mockEnricher struct {
	called bool
	err    error
	enrich func(event *domain.Event)
}

func (m *mockEnricher) Enrich(_ context.Context, event *domain.Event) error {
	m.called = true
	if m.enrich != nil {
		m.enrich(event)
	}
	return m.err
}

const testRawToken = "test-raw-token-for-grpc"

func newTestEnvWithEnrichers(t *testing.T, bookEnricher, filmTVEnricher domain.Enricher) *testEnv {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte(testRawToken), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hashing token: %v", err)
	}

	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}

	cfg := &config.Config{
		Server: config.Server{GRPCPort: 9090},
		Auth: config.Auth{
			WriteTokens: []config.WriteToken{
				{Name: "test", TokenHash: string(hash)},
			},
		},
	}

	gs := grpcapi.NewGRPCServer(cfg, database, zap.NewNop(), bookEnricher, filmTVEnricher)

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

	t.Cleanup(func() {
		conn.Close()
		gs.Stop()
		database.Close()
	})

	return &testEnv{client: pb.NewTimelineServiceClient(conn), db: database}
}

type testEnv struct {
	client pb.TimelineServiceClient
	db     *db.DB
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte(testRawToken), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hashing token: %v", err)
	}

	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}

	cfg := &config.Config{
		Server: config.Server{GRPCPort: 9090},
		Auth: config.Auth{
			WriteTokens: []config.WriteToken{
				{Name: "test", TokenHash: string(hash)},
			},
		},
	}

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

	t.Cleanup(func() {
		conn.Close()
		gs.Stop()
		database.Close()
	})

	return &testEnv{
		client: pb.NewTimelineServiceClient(conn),
		db:     database,
	}
}

// authCtx returns a context with the test bearer token attached.
func authCtx(t *testing.T) context.Context {
	t.Helper()
	return metadata.NewOutgoingContext(context.Background(),
		metadata.Pairs("authorization", "Bearer "+testRawToken))
}

func assertCode(t *testing.T, err error, want codes.Code) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected gRPC error with code %v, got nil", want)
	}
	if got := status.Code(err); got != want {
		t.Errorf("code: got %v, want %v (err: %v)", got, want, err)
	}
}

// --- CreateEvent ---

func TestCreateEvent_WithProvidedID(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "japan-2023", FamilyId: "travel", LineKey: "travel-japan",
		Type: pb.EventType_EVENT_TYPE_POINT, Title: "Japan Trip", Date: "2023-06-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if resp.Event.Id != "japan-2023" {
		t.Errorf("id: got %q, want %q", resp.Event.Id, "japan-2023")
	}
}

func TestCreateEvent_WithoutID_GeneratesNanoid(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		FamilyId: "travel", LineKey: "travel-x", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Auto ID",
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if resp.Event.Id == "" {
		t.Error("expected a generated id, got empty string")
	}
}

func TestCreateEvent_SpanEvent(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "acme-corp", FamilyId: "employment", LineKey: "employment-acme",
		Type: pb.EventType_EVENT_TYPE_SPAN, Title: "Acme Corp", StartDate: "2020-01-01", EndDate: "2023-06-01",
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if resp.Event.StartDate != "2020-01-01" {
		t.Errorf("start_date: got %q, want 2020-01-01", resp.Event.StartDate)
	}
}

func TestCreateEvent_PointEvent(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "concert-1", FamilyId: "hobbies", LineKey: "hobbies-concert",
		Type: pb.EventType_EVENT_TYPE_POINT, Title: "Concert", Date: "2023-03-15",
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if resp.Event.Date != "2023-03-15" {
		t.Errorf("date: got %q, want 2023-03-15", resp.Event.Date)
	}
}

func TestCreateEvent_EmptyTitle_ReturnsInvalidArgument(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		FamilyId: "travel", LineKey: "travel-x", Type: pb.EventType_EVENT_TYPE_POINT, Title: "",
	})
	assertCode(t, err, codes.InvalidArgument)
}

func TestCreateEvent_UnknownFamilyID_ReturnsInvalidArgument(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		FamilyId: "unknown", LineKey: "x", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Test",
	})
	assertCode(t, err, codes.InvalidArgument)
}

func TestCreateEvent_DuplicateID_ReturnsAlreadyExists(t *testing.T) {
	env := newTestEnv(t)
	req := &pb.CreateEventRequest{
		Id: "dup-id", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "First",
	}
	env.client.CreateEvent(authCtx(t), req)
	_, err := env.client.CreateEvent(authCtx(t), req)
	assertCode(t, err, codes.AlreadyExists)
}

func TestCreateEvent_NoToken_ReturnsUnauthenticated(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.CreateEvent(context.Background(), &pb.CreateEventRequest{
		FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Test",
	})
	assertCode(t, err, codes.Unauthenticated)
}

func TestCreateEvent_WrongToken_ReturnsUnauthenticated(t *testing.T) {
	env := newTestEnv(t)
	ctx := metadata.NewOutgoingContext(context.Background(),
		metadata.Pairs("authorization", "Bearer wrongtoken"))
	_, err := env.client.CreateEvent(ctx, &pb.CreateEventRequest{
		FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Test",
	})
	assertCode(t, err, codes.Unauthenticated)
}

func TestCreateEvent_ActivityTypeRoundTrip(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "run-1", FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "Morning Run", Date: "2024-05-01", ActivityType: pb.ActivityType_ACTIVITY_TYPE_RUN,
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if resp.Event.ActivityType != pb.ActivityType_ACTIVITY_TYPE_RUN {
		t.Errorf("activity_type: got %v, want ACTIVITY_TYPE_RUN", resp.Event.ActivityType)
	}
}

func TestCreateEvent_DefaultVisibilityIsPersonal(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "vis-default", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Test",
		// Visibility intentionally omitted
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if resp.Event.Visibility != pb.Visibility_VISIBILITY_PERSONAL {
		t.Errorf("visibility: got %v, want VISIBILITY_PERSONAL", resp.Event.Visibility)
	}
}

// --- UpdateEvent ---

func TestUpdateEvent_FullReplacement(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "upd-1", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "Original", Label: "old label",
	})

	resp, err := env.client.UpdateEvent(authCtx(t), &pb.UpdateEventRequest{
		Id: "upd-1", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "Updated", // Label intentionally omitted — should be cleared
	})
	if err != nil {
		t.Fatalf("UpdateEvent: %v", err)
	}
	if resp.Event.Title != "Updated" {
		t.Errorf("title: got %q, want Updated", resp.Event.Title)
	}
	if resp.Event.Label != "" {
		t.Errorf("label should be cleared, got %q", resp.Event.Label)
	}
}

func TestUpdateEvent_UpdatesTimestamp(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "ts-evt", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Original",
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}

	// Fetch the raw domain event so we can compare updated_at precisely.
	before, err := env.db.GetEventByID(context.Background(), created.Event.Id)
	if err != nil {
		t.Fatalf("GetEventByID before update: %v", err)
	}

	// Force a small wall-clock gap.
	time.Sleep(10 * time.Millisecond)

	_, err = env.client.UpdateEvent(authCtx(t), &pb.UpdateEventRequest{
		Id: "ts-evt", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Updated",
	})
	if err != nil {
		t.Fatalf("UpdateEvent: %v", err)
	}

	after, err := env.db.GetEventByID(context.Background(), created.Event.Id)
	if err != nil {
		t.Fatalf("GetEventByID after update: %v", err)
	}

	if !after.UpdatedAt.After(before.UpdatedAt) {
		t.Errorf("updated_at not advanced: before=%v after=%v", before.UpdatedAt, after.UpdatedAt)
	}
}

func TestUpdateEvent_NotFound(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.UpdateEvent(authCtx(t), &pb.UpdateEventRequest{
		Id: "ghost", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	assertCode(t, err, codes.NotFound)
}

func TestUpdateEvent_SoftDeletedReturnsNotFound(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "del-upd", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	env.client.DeleteEvent(authCtx(t), &pb.DeleteEventRequest{Id: "del-upd"})

	_, err := env.client.UpdateEvent(authCtx(t), &pb.UpdateEventRequest{
		Id: "del-upd", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	assertCode(t, err, codes.NotFound)
}

// --- DeleteEvent ---

func TestDeleteEvent_SoftDeletes(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "to-del", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	_, err := env.client.DeleteEvent(authCtx(t), &pb.DeleteEventRequest{Id: "to-del"})
	if err != nil {
		t.Fatalf("DeleteEvent: %v", err)
	}
	// Verify via DB that the event is soft-deleted.
	_, dbErr := env.db.GetEventByID(context.Background(), "to-del")
	if dbErr == nil {
		t.Error("expected not-found after soft delete, got nil")
	}
}

func TestDeleteEvent_NotFound(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.DeleteEvent(authCtx(t), &pb.DeleteEventRequest{Id: "ghost"})
	assertCode(t, err, codes.NotFound)
}

func TestDeleteEvent_AlreadyDeleted_ReturnsNotFound(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "double-del", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	env.client.DeleteEvent(authCtx(t), &pb.DeleteEventRequest{Id: "double-del"})
	_, err := env.client.DeleteEvent(authCtx(t), &pb.DeleteEventRequest{Id: "double-del"})
	assertCode(t, err, codes.NotFound)
}

// --- AddPhoto ---

func TestAddPhoto_AppearsInEvent(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "evt-p", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	resp, err := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{
		EventId: "evt-p", S3Url: "https://s3/p1.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL,
	})
	if err != nil {
		t.Fatalf("AddPhoto: %v", err)
	}
	if resp.Photo.Id == "" {
		t.Error("expected non-empty photo id")
	}
	if resp.Photo.SortOrder != 0 {
		t.Errorf("sort_order: got %d, want 0", resp.Photo.SortOrder)
	}
}

func TestAddPhoto_AppendedAtEnd(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "evt-p2", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-p2", S3Url: "https://s3/a.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})
	resp, _ := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-p2", S3Url: "https://s3/b.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})
	if resp.Photo.SortOrder != 1 {
		t.Errorf("second photo sort_order: got %d, want 1", resp.Photo.SortOrder)
	}
}

func TestAddPhoto_UnknownEvent_ReturnsNotFound(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{
		EventId: "no-such-event", S3Url: "https://s3/x.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL,
	})
	assertCode(t, err, codes.NotFound)
}

// --- RemovePhoto ---

func TestRemovePhoto_NoLongerListed(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "evt-rm", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	p, _ := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-rm", S3Url: "https://s3/x.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})
	_, err := env.client.RemovePhoto(authCtx(t), &pb.RemovePhotoRequest{Id: p.Photo.Id})
	if err != nil {
		t.Fatalf("RemovePhoto: %v", err)
	}
	photos, _ := env.db.ListPhotosForEvent(context.Background(), "evt-rm")
	if len(photos) != 0 {
		t.Errorf("expected 0 photos after remove, got %d", len(photos))
	}
}

func TestRemovePhoto_NotFound(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.RemovePhoto(authCtx(t), &pb.RemovePhotoRequest{Id: "ghost"})
	assertCode(t, err, codes.NotFound)
}

// --- ReorderPhotos ---

func TestReorderPhotos_UpdatesOrder(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "evt-reorder", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	p1, _ := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-reorder", S3Url: "https://s3/1.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})
	p2, _ := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-reorder", S3Url: "https://s3/2.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})
	p3, _ := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-reorder", S3Url: "https://s3/3.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})

	resp, err := env.client.ReorderPhotos(authCtx(t), &pb.ReorderPhotosRequest{
		EventId:  "evt-reorder",
		PhotoIds: []string{p3.Photo.Id, p1.Photo.Id, p2.Photo.Id},
	})
	if err != nil {
		t.Fatalf("ReorderPhotos: %v", err)
	}
	want := []string{p3.Photo.Id, p1.Photo.Id, p2.Photo.Id}
	for i, p := range resp.Event.Photos {
		if p.Id != want[i] {
			t.Errorf("photos[%d]: got %q, want %q", i, p.Id, want[i])
		}
	}
}

func TestReorderPhotos_IDNotBelongingToEvent_ReturnsInvalidArgument(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "evt-ro-bad", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	p1, _ := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-ro-bad", S3Url: "https://s3/1.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})

	_, err := env.client.ReorderPhotos(authCtx(t), &pb.ReorderPhotosRequest{
		EventId:  "evt-ro-bad",
		PhotoIds: []string{p1.Photo.Id, "foreign-photo-id"},
	})
	assertCode(t, err, codes.InvalidArgument)
}

func TestReorderPhotos_MissingPhotoIDs_ReturnsInvalidArgument(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "evt-ro-inc", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	p1, _ := env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-ro-inc", S3Url: "https://s3/1.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})
	env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{EventId: "evt-ro-inc", S3Url: "https://s3/2.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL})

	// Only submitting one of two photos
	_, err := env.client.ReorderPhotos(authCtx(t), &pb.ReorderPhotosRequest{
		EventId:  "evt-ro-inc",
		PhotoIds: []string{p1.Photo.Id},
	})
	assertCode(t, err, codes.InvalidArgument)
}

// --- ListEvents ---

func TestListEvents_ReturnsAllEvents(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-1", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Trip A",
		Date: "2023-01-10", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-2", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Trip B",
		Date: "2023-06-15", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})

	resp, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(resp.Events) != 2 {
		t.Errorf("event count: got %d, want 2", len(resp.Events))
	}
}

func TestListEvents_FilterByFamilyID(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-travel", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Trip",
		Date: "2023-01-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-book", FamilyId: "books", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Book",
		Date: "2023-01-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})

	resp, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{FamilyId: "travel"})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(resp.Events) != 1 || resp.Events[0].Id != "le-travel" {
		t.Errorf("expected only le-travel, got %+v", resp.Events)
	}
}

func TestListEvents_FilterByDateRange(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-early", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Early",
		Date: "2022-03-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-mid", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Mid",
		Date: "2023-06-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-late", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Late",
		Date: "2024-09-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})

	resp, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{
		From: "2023-01-01",
		To:   "2023-12-31",
	})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(resp.Events) != 1 || resp.Events[0].Id != "le-mid" {
		t.Errorf("expected only le-mid, got %+v", resp.Events)
	}
}

func TestListEvents_FilterByVisibility(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-pub", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Public",
		Date: "2023-01-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-priv", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Private",
		Date: "2023-01-01", Visibility: pb.Visibility_VISIBILITY_PERSONAL,
	})

	resp, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{
		Visibilities: []pb.Visibility{pb.Visibility_VISIBILITY_PUBLIC},
	})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(resp.Events) != 1 || resp.Events[0].Id != "le-pub" {
		t.Errorf("expected only le-pub, got %+v", resp.Events)
	}
}

func TestListEvents_SoftDeletedEventExcluded(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-del", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
		Date: "2023-01-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	env.client.DeleteEvent(authCtx(t), &pb.DeleteEventRequest{Id: "le-del"})

	resp, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(resp.Events) != 0 {
		t.Errorf("expected 0 events after soft delete, got %d", len(resp.Events))
	}
}

func TestListEvents_IncludesPhotos(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "le-photo", FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
		Date: "2023-01-01", Visibility: pb.Visibility_VISIBILITY_PUBLIC,
	})
	env.client.AddPhoto(authCtx(t), &pb.AddPhotoRequest{
		EventId: "le-photo", S3Url: "https://s3/x.jpg", Variant: pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL,
	})

	resp, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(resp.Events) != 1 || len(resp.Events[0].Photos) != 1 {
		t.Errorf("expected 1 event with 1 photo, got %+v", resp.Events)
	}
}

// --- MergeEvents ---

func TestMergeEvents_SetsCanonicalID(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "canon-1", FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "Canonical Run", ActivityType: pb.ActivityType_ACTIVITY_TYPE_RUN,
	})
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "linked-1", FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "Garmin Run", ActivityType: pb.ActivityType_ACTIVITY_TYPE_RUN,
	})

	_, err := env.client.MergeEvents(authCtx(t), &pb.MergeEventsRequest{
		CanonicalId: "canon-1",
		EventIds:    []string{"linked-1"},
	})
	if err != nil {
		t.Fatalf("MergeEvents: %v", err)
	}

	// ListEvents should only return the canonical row.
	list, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents after merge: %v", err)
	}
	if len(list.Events) != 1 || list.Events[0].Id != "canon-1" {
		t.Errorf("expected only canon-1, got %+v", list.Events)
	}
}

func TestMergeEvents_UnknownCanonicalID_ReturnsNotFound(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "linked-x", FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	_, err := env.client.MergeEvents(authCtx(t), &pb.MergeEventsRequest{
		CanonicalId: "ghost",
		EventIds:    []string{"linked-x"},
	})
	assertCode(t, err, codes.NotFound)
}

func TestMergeEvents_UnknownLinkedID_ReturnsInvalidArgument(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "canon-x", FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "x",
	})
	_, err := env.client.MergeEvents(authCtx(t), &pb.MergeEventsRequest{
		CanonicalId: "canon-x",
		EventIds:    []string{"ghost"},
	})
	assertCode(t, err, codes.InvalidArgument)
}

// --- UnmergeEvent ---

func TestUnmergeEvent_ClearsCanonicalID(t *testing.T) {
	env := newTestEnv(t)
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "canon-2", FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Canon",
	})
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "linked-2", FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Linked",
	})
	env.client.MergeEvents(authCtx(t), &pb.MergeEventsRequest{
		CanonicalId: "canon-2",
		EventIds:    []string{"linked-2"},
	})

	// Unmerge: linked-2 should become standalone.
	_, err := env.client.UnmergeEvent(authCtx(t), &pb.UnmergeEventRequest{Id: "linked-2"})
	if err != nil {
		t.Fatalf("UnmergeEvent: %v", err)
	}

	list, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents after unmerge: %v", err)
	}
	ids := make(map[string]bool)
	for _, e := range list.Events {
		ids[e.Id] = true
	}
	if !ids["canon-2"] || !ids["linked-2"] {
		t.Errorf("expected both events after unmerge, got ids: %v", ids)
	}
}

func TestUnmergeEvent_UnknownID_ReturnsNotFound(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.client.UnmergeEvent(authCtx(t), &pb.UnmergeEventRequest{Id: "ghost"})
	assertCode(t, err, codes.NotFound)
}

// --- ImportEvents ---

func importReqs(count int, familyID string) []*pb.CreateEventRequest {
	reqs := make([]*pb.CreateEventRequest, count)
	for i := 0; i < count; i++ {
		reqs[i] = &pb.CreateEventRequest{
			FamilyId:      familyID,
			LineKey:       "l",
			Type:          pb.EventType_EVENT_TYPE_POINT,
			Title:         fmt.Sprintf("Event %d", i+1),
			Date:          fmt.Sprintf("2024-01-%02d", i+1),
			SourceEventId: fmt.Sprintf("src-%d", i+1),
		}
	}
	return reqs
}

func TestImportEvents_NewEvents_Created(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events:           importReqs(3, "travel"),
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	})
	if err != nil {
		t.Fatalf("ImportEvents: %v", err)
	}
	if resp.Created != 3 || resp.Updated != 0 || resp.Skipped != 0 || resp.Failed != 0 {
		t.Errorf("counts: got created=%d updated=%d skipped=%d failed=%d, want 3/0/0/0",
			resp.Created, resp.Updated, resp.Skipped, resp.Failed)
	}
}

func TestImportEvents_Upsert_ReimportUpdates(t *testing.T) {
	env := newTestEnv(t)
	reqs := importReqs(3, "travel")
	env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events:           reqs,
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	})
	resp, err := env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events:           reqs,
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	})
	if err != nil {
		t.Fatalf("ImportEvents (re-import): %v", err)
	}
	if resp.Created != 0 || resp.Updated != 3 || resp.Skipped != 0 || resp.Failed != 0 {
		t.Errorf("counts: got created=%d updated=%d skipped=%d failed=%d, want 0/3/0/0",
			resp.Created, resp.Updated, resp.Skipped, resp.Failed)
	}
}

func TestImportEvents_Skip_ReimportSkips(t *testing.T) {
	env := newTestEnv(t)
	reqs := importReqs(3, "travel")
	env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events:           reqs,
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	})
	resp, err := env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events:           reqs,
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_SKIP,
		SourceService:    "garmin",
	})
	if err != nil {
		t.Fatalf("ImportEvents (skip): %v", err)
	}
	if resp.Created != 0 || resp.Updated != 0 || resp.Skipped != 3 || resp.Failed != 0 {
		t.Errorf("counts: got created=%d updated=%d skipped=%d failed=%d, want 0/0/3/0",
			resp.Created, resp.Updated, resp.Skipped, resp.Failed)
	}
}

func TestImportEvents_InvalidEvent_CountedAsFailed(t *testing.T) {
	env := newTestEnv(t)
	resp, err := env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events: []*pb.CreateEventRequest{
			{FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Good"},
			{FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: ""}, // invalid
			{FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Also Good"},
		},
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	})
	if err != nil {
		t.Fatalf("ImportEvents: %v", err)
	}
	if resp.Created != 2 || resp.Failed != 1 || len(resp.Errors) == 0 {
		t.Errorf("counts: got created=%d failed=%d errors=%v, want 2/1/non-empty",
			resp.Created, resp.Failed, resp.Errors)
	}
}

func TestImportEvents_SourceServiceStoredOnEvents(t *testing.T) {
	env := newTestEnv(t)
	env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events: []*pb.CreateEventRequest{
			{FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
				Title: "Run", Date: "2024-03-01", SourceEventId: "g-001",
				ActivityType: pb.ActivityType_ACTIVITY_TYPE_RUN},
		},
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	})

	list, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(list.Events) != 1 || list.Events[0].SourceService != "garmin" {
		t.Errorf("expected source_service=garmin, got %+v", list.Events)
	}
}

func TestImportEvents_AutoMerge_LinkedToCanonical(t *testing.T) {
	env := newTestEnv(t)

	// Create a canonical run event manually.
	env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		Id: "manual-run", FamilyId: "fitness", LineKey: "l",
		Type: pb.EventType_EVENT_TYPE_POINT, Title: "My Run",
		Date: "2024-06-01", ActivityType: pb.ActivityType_ACTIVITY_TYPE_RUN,
	})

	// Import a Garmin run on the same date — should auto-merge.
	env.client.ImportEvents(authCtx(t), &pb.ImportEventsRequest{
		Events: []*pb.CreateEventRequest{
			{FamilyId: "fitness", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
				Title: "Garmin Run", Date: "2024-06-01", SourceEventId: "g-100",
				ActivityType: pb.ActivityType_ACTIVITY_TYPE_RUN},
		},
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	})

	// ListEvents should return only the canonical row.
	list, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(list.Events) != 1 || list.Events[0].Id != "manual-run" {
		t.Errorf("expected only canonical manual-run, got %d events: %+v", len(list.Events), list.Events)
	}
}

func TestImportEvents_SourceEventIDUsedForDedup(t *testing.T) {
	env := newTestEnv(t)
	req := &pb.ImportEventsRequest{
		Events: []*pb.CreateEventRequest{
			{FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
				Title: "Trip", Date: "2024-01-01", SourceEventId: "dedup-1"},
		},
		ConflictStrategy: pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT,
		SourceService:    "garmin",
	}
	env.client.ImportEvents(authCtx(t), req)
	// Re-import same source_event_id — should update, not create duplicate.
	env.client.ImportEvents(authCtx(t), req)

	list, err := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(list.Events) != 1 {
		t.Errorf("expected 1 event after re-import, got %d", len(list.Events))
	}
}

// --- Enrichment ---

func TestCreateEvent_Books_CallsEnricher(t *testing.T) {
	enricher := &mockEnricher{
		enrich: func(event *domain.Event) {
			meta := `{"isbn":"9780441013593","author":"Frank Herbert","cover_image_url":"https://s3/cover.jpg"}`
			event.Metadata = &meta
		},
	}
	env := newTestEnvWithEnrichers(t, enricher, nil)

	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		FamilyId: "books", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "Dune", Metadata: `{"isbn":"9780441013593"}`,
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if !enricher.called {
		t.Error("expected book enricher to be called")
	}
	if resp.Event.Metadata == "" {
		t.Error("expected enriched metadata in response")
	}
}

func TestCreateEvent_FilmTV_CallsEnricher(t *testing.T) {
	enricher := &mockEnricher{
		enrich: func(event *domain.Event) {
			meta := `{"tmdb_id":"238","type":"movie","director":"Francis Ford Coppola","year":1972,"poster_url":"https://s3/poster.jpg"}`
			event.Metadata = &meta
		},
	}
	env := newTestEnvWithEnrichers(t, nil, enricher)

	resp, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		FamilyId: "film_tv", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "The Godfather", Metadata: `{"tmdb_id":"238","type":"movie"}`,
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if !enricher.called {
		t.Error("expected film_tv enricher to be called")
	}
	if resp.Event.Metadata == "" {
		t.Error("expected enriched metadata in response")
	}
}

func TestCreateEvent_OtherFamily_DoesNotCallEnricher(t *testing.T) {
	bookEnricher := &mockEnricher{}
	filmEnricher := &mockEnricher{}
	env := newTestEnvWithEnrichers(t, bookEnricher, filmEnricher)

	_, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		FamilyId: "travel", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT, Title: "Japan Trip",
	})
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if bookEnricher.called || filmEnricher.called {
		t.Error("expected no enricher to be called for travel family")
	}
}

func TestCreateEvent_EnricherFailure_ReturnsInternal(t *testing.T) {
	enricher := &mockEnricher{err: fmt.Errorf("isbndb unreachable")}
	env := newTestEnvWithEnrichers(t, enricher, nil)

	_, err := env.client.CreateEvent(authCtx(t), &pb.CreateEventRequest{
		FamilyId: "books", LineKey: "l", Type: pb.EventType_EVENT_TYPE_POINT,
		Title: "Dune", Metadata: `{"isbn":"9780441013593"}`,
	})
	if status.Code(err) != codes.Internal {
		t.Errorf("expected codes.Internal, got %v", err)
	}

	// Event must not have been stored.
	list, _ := env.client.ListEvents(authCtx(t), &pb.ListEventsRequest{})
	if len(list.GetEvents()) != 0 {
		t.Errorf("expected no events stored after enrichment failure, got %d", len(list.GetEvents()))
	}
}
