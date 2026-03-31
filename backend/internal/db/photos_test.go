package db_test

import (
	"context"
	"testing"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

func createTestEvent(t *testing.T, d interface {
	CreateEvent(context.Context, *domain.Event) error
}, id string) {
	t.Helper()
	e := baseEvent(id)
	if err := d.CreateEvent(context.Background(), e); err != nil {
		t.Fatalf("creating test event %s: %v", id, err)
	}
}

func basePhoto(id, eventID string, order int) *domain.Photo {
	return &domain.Photo{
		ID:        id,
		EventID:   eventID,
		S3URL:     "https://s3.example.com/" + id + ".jpg",
		Variant:   domain.PhotoVariantOriginal,
		SortOrder: order,
	}
}

func TestAddPhoto_AppearsInListPhotosForEvent(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	createTestEvent(t, d, "evt-1")

	p := basePhoto("photo-1", "evt-1", 0)
	if err := d.AddPhoto(ctx, p); err != nil {
		t.Fatalf("AddPhoto: %v", err)
	}

	photos, err := d.ListPhotosForEvent(ctx, "evt-1")
	if err != nil {
		t.Fatalf("ListPhotosForEvent: %v", err)
	}
	if len(photos) != 1 || photos[0].ID != "photo-1" {
		t.Errorf("expected [photo-1], got %v", photoIDs(photos))
	}
}

func TestRemovePhoto_NoLongerListed(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	createTestEvent(t, d, "evt-2")
	d.AddPhoto(ctx, basePhoto("photo-2", "evt-2", 0))

	if err := d.RemovePhoto(ctx, "photo-2"); err != nil {
		t.Fatalf("RemovePhoto: %v", err)
	}

	photos, _ := d.ListPhotosForEvent(ctx, "evt-2")
	if len(photos) != 0 {
		t.Errorf("expected no photos, got %v", photoIDs(photos))
	}
}

func TestListPhotosForEvent_OrderedBySortOrder(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	createTestEvent(t, d, "evt-3")
	d.AddPhoto(ctx, basePhoto("photo-c", "evt-3", 2))
	d.AddPhoto(ctx, basePhoto("photo-a", "evt-3", 0))
	d.AddPhoto(ctx, basePhoto("photo-b", "evt-3", 1))

	photos, err := d.ListPhotosForEvent(ctx, "evt-3")
	if err != nil {
		t.Fatalf("ListPhotosForEvent: %v", err)
	}
	want := []string{"photo-a", "photo-b", "photo-c"}
	got := photoIDs(photos)
	for i, id := range want {
		if i >= len(got) || got[i] != id {
			t.Errorf("sort order wrong: got %v, want %v", got, want)
			break
		}
	}
}

func TestReorderPhotos_UpdatesSortOrder(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	createTestEvent(t, d, "evt-4")
	d.AddPhoto(ctx, basePhoto("p1", "evt-4", 0))
	d.AddPhoto(ctx, basePhoto("p2", "evt-4", 1))
	d.AddPhoto(ctx, basePhoto("p3", "evt-4", 2))

	if err := d.ReorderPhotos(ctx, "evt-4", []string{"p3", "p1", "p2"}); err != nil {
		t.Fatalf("ReorderPhotos: %v", err)
	}

	photos, _ := d.ListPhotosForEvent(ctx, "evt-4")
	want := []string{"p3", "p1", "p2"}
	got := photoIDs(photos)
	for i, id := range want {
		if i >= len(got) || got[i] != id {
			t.Errorf("reorder wrong: got %v, want %v", got, want)
			break
		}
	}
}

func TestAddPhoto_UnknownEventID_ReturnsForeignKeyError(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	p := basePhoto("orphan-photo", "nonexistent-event", 0)
	err := d.AddPhoto(ctx, p)
	if err == nil {
		t.Error("expected foreign key error for unknown event_id, got nil")
	}
}

func photoIDs(photos []*domain.Photo) []string {
	ids := make([]string, len(photos))
	for i, p := range photos {
		ids[i] = p.ID
	}
	return ids
}
