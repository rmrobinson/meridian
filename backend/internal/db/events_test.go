package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

func baseEvent(id string) *domain.Event {
	now := time.Now().UTC().Truncate(time.Second)
	date := "2023-06-15"
	return &domain.Event{
		ID:        id,
		FamilyID:  "travel",
		LineKey:   "travel-japan-2023",
		Type:      domain.EventTypePoint,
		Title:     "Japan Trip",
		Date:      &date,
		Visibility: domain.VisibilityPublic,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

func TestCreateEvent_AndGetByID(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	e := baseEvent("japan-2023")
	if err := d.CreateEvent(ctx, e); err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}

	got, err := d.GetEventByID(ctx, "japan-2023")
	if err != nil {
		t.Fatalf("GetEventByID: %v", err)
	}
	if got.ID != e.ID {
		t.Errorf("ID: got %q, want %q", got.ID, e.ID)
	}
	if got.Title != e.Title {
		t.Errorf("Title: got %q, want %q", got.Title, e.Title)
	}
	if got.FamilyID != e.FamilyID {
		t.Errorf("FamilyID: got %q, want %q", got.FamilyID, e.FamilyID)
	}
	if got.Visibility != e.Visibility {
		t.Errorf("Visibility: got %q, want %q", got.Visibility, e.Visibility)
	}
}

func TestCreateEvent_AllFieldsIntact(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	label := "Trip label"
	icon := "airplane"
	startDate := "2023-06-01"
	endDate := "2023-06-30"
	locationLabel := "Tokyo, Japan"
	lat := 35.6762
	lng := 139.6503
	externalURL := "https://example.com/trip"
	heroImageURL := "https://s3.example.com/hero.jpg"
	metadata := `{"countries":["Japan"]}`
	sourceService := "manual"
	sourceEventID := "manual-123"

	e := &domain.Event{
		ID:            "full-fields",
		FamilyID:      "travel",
		LineKey:       "travel-japan-2023",
		Type:          domain.EventTypeSpan,
		Title:         "Japan Trip",
		Label:         &label,
		Icon:          &icon,
		StartDate:     &startDate,
		EndDate:       &endDate,
		LocationLabel: &locationLabel,
		LocationLat:   &lat,
		LocationLng:   &lng,
		ExternalURL:   &externalURL,
		HeroImageURL:  &heroImageURL,
		Metadata:      &metadata,
		Visibility:    domain.VisibilityFriends,
		SourceService: &sourceService,
		SourceEventID: &sourceEventID,
		CreatedAt:     time.Now().UTC().Truncate(time.Second),
		UpdatedAt:     time.Now().UTC().Truncate(time.Second),
	}

	if err := d.CreateEvent(ctx, e); err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}

	got, err := d.GetEventByID(ctx, "full-fields")
	if err != nil {
		t.Fatalf("GetEventByID: %v", err)
	}

	if got.LineKey != e.LineKey {
		t.Errorf("LineKey: got %q, want %q", got.LineKey, e.LineKey)
	}
	if got.Type != domain.EventTypeSpan {
		t.Errorf("Type: got %q, want span", got.Type)
	}
	if got.StartDate == nil || *got.StartDate != startDate {
		t.Errorf("StartDate: got %v, want %q", got.StartDate, startDate)
	}
	if got.EndDate == nil || *got.EndDate != endDate {
		t.Errorf("EndDate: got %v, want %q", got.EndDate, endDate)
	}
	if got.Label == nil || *got.Label != label {
		t.Errorf("Label: got %v, want %q", got.Label, label)
	}
	if got.Icon == nil || *got.Icon != icon {
		t.Errorf("Icon: got %v, want %q", got.Icon, icon)
	}
	if got.LocationLabel == nil || *got.LocationLabel != locationLabel {
		t.Errorf("LocationLabel: got %v, want %q", got.LocationLabel, locationLabel)
	}
	if got.LocationLat == nil || *got.LocationLat != lat {
		t.Errorf("LocationLat: got %v, want %v", got.LocationLat, lat)
	}
	if got.LocationLng == nil || *got.LocationLng != lng {
		t.Errorf("LocationLng: got %v, want %v", got.LocationLng, lng)
	}
	if got.ExternalURL == nil || *got.ExternalURL != externalURL {
		t.Errorf("ExternalURL: got %v, want %q", got.ExternalURL, externalURL)
	}
	if got.HeroImageURL == nil || *got.HeroImageURL != heroImageURL {
		t.Errorf("HeroImageURL: got %v, want %q", got.HeroImageURL, heroImageURL)
	}
	if got.Metadata == nil || *got.Metadata != metadata {
		t.Errorf("Metadata: got %v, want %q", got.Metadata, metadata)
	}
	if got.SourceService == nil || *got.SourceService != sourceService {
		t.Errorf("SourceService: got %v, want %q", got.SourceService, sourceService)
	}
	if got.SourceEventID == nil || *got.SourceEventID != sourceEventID {
		t.Errorf("SourceEventID: got %v, want %q", got.SourceEventID, sourceEventID)
	}
	if got.Visibility != domain.VisibilityFriends {
		t.Errorf("Visibility: got %q, want friends", got.Visibility)
	}
}

func TestGetEventByID_SoftDeleted(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	e := baseEvent("to-delete")
	d.CreateEvent(ctx, e)
	d.SoftDeleteEvent(ctx, e.ID)

	_, err := d.GetEventByID(ctx, e.ID)
	if err != db.ErrNotFound {
		t.Errorf("expected ErrNotFound for soft-deleted event, got %v", err)
	}
}

func TestGetEventByID_Unknown(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	_, err := d.GetEventByID(ctx, "does-not-exist")
	if err != db.ErrNotFound {
		t.Errorf("expected ErrNotFound for unknown ID, got %v", err)
	}
}

func TestListEvents_ExcludesSoftDeleted(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	d.CreateEvent(ctx, baseEvent("e1"))
	d.CreateEvent(ctx, baseEvent("e2"))
	d.SoftDeleteEvent(ctx, "e2")

	events, err := d.ListEvents(ctx, db.ListEventsFilter{Visibilities: []domain.Visibility{domain.VisibilityPublic}})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 || events[0].ID != "e1" {
		t.Errorf("expected only e1, got %v", eventIDs(events))
	}
}

func TestListEvents_ExcludesNonCanonical(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	canonical := baseEvent("canonical")
	d.CreateEvent(ctx, canonical)

	linked := baseEvent("linked")
	linked.CanonicalID = &canonical.ID
	d.CreateEvent(ctx, linked)

	events, err := d.ListEvents(ctx, db.ListEventsFilter{Visibilities: []domain.Visibility{domain.VisibilityPublic}})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 || events[0].ID != "canonical" {
		t.Errorf("expected only canonical, got %v", eventIDs(events))
	}
}

func TestListEvents_FilterByFamilyID(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	travel := baseEvent("travel-1")
	travel.FamilyID = "travel"
	d.CreateEvent(ctx, travel)

	books := baseEvent("books-1")
	books.FamilyID = "books"
	d.CreateEvent(ctx, books)

	events, err := d.ListEvents(ctx, db.ListEventsFilter{
		FamilyID:     "travel",
		Visibilities: []domain.Visibility{domain.VisibilityPublic},
	})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 || events[0].ID != "travel-1" {
		t.Errorf("expected only travel-1, got %v", eventIDs(events))
	}
}

func TestListEvents_FilterFromDate(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	early := baseEvent("early")
	earlyDate := "2020-01-01"
	early.Date = &earlyDate
	d.CreateEvent(ctx, early)

	late := baseEvent("late")
	lateDate := "2023-06-15"
	late.Date = &lateDate
	d.CreateEvent(ctx, late)

	events, err := d.ListEvents(ctx, db.ListEventsFilter{
		From:         "2021-01-01",
		Visibilities: []domain.Visibility{domain.VisibilityPublic},
	})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 || events[0].ID != "late" {
		t.Errorf("expected only late, got %v", eventIDs(events))
	}
}

func TestListEvents_FilterToDate(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	early := baseEvent("early")
	earlyDate := "2020-01-01"
	early.Date = &earlyDate
	d.CreateEvent(ctx, early)

	late := baseEvent("late")
	lateDate := "2023-06-15"
	late.Date = &lateDate
	d.CreateEvent(ctx, late)

	events, err := d.ListEvents(ctx, db.ListEventsFilter{
		To:           "2021-01-01",
		Visibilities: []domain.Visibility{domain.VisibilityPublic},
	})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 || events[0].ID != "early" {
		t.Errorf("expected only early, got %v", eventIDs(events))
	}
}

func TestListEvents_FilterSingleVisibility(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	pub := baseEvent("public-event")
	pub.Visibility = domain.VisibilityPublic
	d.CreateEvent(ctx, pub)

	personal := baseEvent("personal-event")
	personal.Visibility = domain.VisibilityPersonal
	d.CreateEvent(ctx, personal)

	events, err := d.ListEvents(ctx, db.ListEventsFilter{
		Visibilities: []domain.Visibility{domain.VisibilityPublic},
	})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 || events[0].ID != "public-event" {
		t.Errorf("expected only public-event, got %v", eventIDs(events))
	}
}

func TestListEvents_FilterMultipleVisibilities(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	pub := baseEvent("public-event")
	pub.Visibility = domain.VisibilityPublic
	d.CreateEvent(ctx, pub)

	friends := baseEvent("friends-event")
	friends.Visibility = domain.VisibilityFriends
	d.CreateEvent(ctx, friends)

	personal := baseEvent("personal-event")
	personal.Visibility = domain.VisibilityPersonal
	d.CreateEvent(ctx, personal)

	events, err := d.ListEvents(ctx, db.ListEventsFilter{
		Visibilities: []domain.Visibility{domain.VisibilityPublic, domain.VisibilityFriends},
	})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 2 {
		t.Errorf("expected 2 events, got %v", eventIDs(events))
	}
}

func TestUpdateEvent_ReplacesFieldsAndUpdatesTimestamp(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	e := baseEvent("update-me")
	d.CreateEvent(ctx, e)

	original, _ := d.GetEventByID(ctx, "update-me")

	// Wait briefly so updated_at will differ
	time.Sleep(10 * time.Millisecond)

	e.Title = "Updated Title"
	e.Visibility = domain.VisibilityPersonal
	if err := d.UpdateEvent(ctx, e); err != nil {
		t.Fatalf("UpdateEvent: %v", err)
	}

	got, _ := d.GetEventByID(ctx, "update-me")
	if got.Title != "Updated Title" {
		t.Errorf("Title: got %q, want %q", got.Title, "Updated Title")
	}
	if got.Visibility != domain.VisibilityPersonal {
		t.Errorf("Visibility: got %q, want personal", got.Visibility)
	}
	if !got.UpdatedAt.After(original.UpdatedAt) {
		t.Errorf("updated_at should be later than original: %v vs %v", got.UpdatedAt, original.UpdatedAt)
	}
}

func TestUpdateEvent_ClearsNullableField(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	label := "original label"
	e := baseEvent("clear-me")
	e.Label = &label
	d.CreateEvent(ctx, e)

	// Update with Label explicitly nil — full replacement should clear it
	e.Label = nil
	if err := d.UpdateEvent(ctx, e); err != nil {
		t.Fatalf("UpdateEvent: %v", err)
	}

	got, _ := d.GetEventByID(ctx, "clear-me")
	if got.Label != nil {
		t.Errorf("Label should be nil after update, got %q", *got.Label)
	}
}

func TestUpdateEvent_UnknownID_ReturnsNotFound(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	e := baseEvent("ghost")
	err := d.UpdateEvent(ctx, e)
	if err != db.ErrNotFound {
		t.Errorf("expected ErrNotFound for unknown ID, got %v", err)
	}
}

func TestSoftDeleteEvent_UnknownID_ReturnsNotFound(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	err := d.SoftDeleteEvent(ctx, "ghost")
	if err != db.ErrNotFound {
		t.Errorf("expected ErrNotFound for unknown ID, got %v", err)
	}
}

func TestSoftDeleteEvent_ExcludesFromListEvents(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	d.CreateEvent(ctx, baseEvent("del-me"))
	if err := d.SoftDeleteEvent(ctx, "del-me"); err != nil {
		t.Fatalf("SoftDeleteEvent: %v", err)
	}

	events, _ := d.ListEvents(ctx, db.ListEventsFilter{
		Visibilities: []domain.Visibility{domain.VisibilityPublic},
	})
	for _, ev := range events {
		if ev.ID == "del-me" {
			t.Error("soft-deleted event should not appear in ListEvents")
		}
	}
}

func TestGetEventWithLinked_ReturnsLinkedRows(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	canonical := baseEvent("canon")
	d.CreateEvent(ctx, canonical)

	linked1 := baseEvent("linked-1")
	linked1.CanonicalID = &canonical.ID
	d.CreateEvent(ctx, linked1)

	linked2 := baseEvent("linked-2")
	linked2.CanonicalID = &canonical.ID
	d.CreateEvent(ctx, linked2)

	got, linked, err := d.GetEventWithLinked(ctx, "canon")
	if err != nil {
		t.Fatalf("GetEventWithLinked: %v", err)
	}
	if got.ID != "canon" {
		t.Errorf("canonical ID: got %q, want %q", got.ID, "canon")
	}
	if len(linked) != 2 {
		t.Errorf("expected 2 linked events, got %d", len(linked))
	}
}

func TestGetEventWithLinked_EmptyLinked(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	d.CreateEvent(ctx, baseEvent("solo"))

	_, linked, err := d.GetEventWithLinked(ctx, "solo")
	if err != nil {
		t.Fatalf("GetEventWithLinked: %v", err)
	}
	if len(linked) != 0 {
		t.Errorf("expected 0 linked events, got %d", len(linked))
	}
}

func eventIDs(events []*domain.Event) []string {
	ids := make([]string, len(events))
	for i, e := range events {
		ids[i] = e.ID
	}
	return ids
}
