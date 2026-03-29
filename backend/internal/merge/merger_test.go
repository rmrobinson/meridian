package merge_test

import (
	"context"
	"testing"

	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
	"github.com/rmrobinson/meridian/backend/internal/merge"
)

// stubLister is a simple EventLister that returns a fixed list of events.
type stubLister struct {
	events []*domain.Event
}

func (s *stubLister) ListEvents(_ context.Context, _ db.ListEventsFilter) ([]*domain.Event, error) {
	return s.events, nil
}

func strPtr(s string) *string { return &s }

// --- FindMergeCandidates ---

func TestFindMergeCandidates_NoEvents_ReturnsNil(t *testing.T) {
	lister := &stubLister{}
	incoming := &domain.Event{ActivityType: domain.ActivityTypeRun, Date: strPtr("2024-05-01")}
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestFindMergeCandidates_DifferentActivityType_ReturnsNil(t *testing.T) {
	existing := &domain.Event{ID: "e1", ActivityType: domain.ActivityTypeHike, Date: strPtr("2024-05-01")}
	lister := &stubLister{events: []*domain.Event{existing}}
	incoming := &domain.Event{ActivityType: domain.ActivityTypeRun, Date: strPtr("2024-05-01")}
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for different activity type, got %+v", got)
	}
}

func TestFindMergeCandidates_UnspecifiedActivityType_ReturnsNil(t *testing.T) {
	existing := &domain.Event{ID: "e1", ActivityType: domain.ActivityTypeRun, Date: strPtr("2024-05-01")}
	lister := &stubLister{events: []*domain.Event{existing}}
	// Incoming has no activity type — should not attempt merge.
	incoming := &domain.Event{ActivityType: domain.ActivityTypeUnspecified, Date: strPtr("2024-05-01")}
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for unspecified activity type, got %+v", got)
	}
}

func TestFindMergeCandidates_NoDate_ReturnsNil(t *testing.T) {
	lister := &stubLister{events: []*domain.Event{
		{ID: "e1", ActivityType: domain.ActivityTypeRun},
	}}
	incoming := &domain.Event{ActivityType: domain.ActivityTypeRun} // no date
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for missing date, got %+v", got)
	}
}

func TestFindMergeCandidates_MatchOnDateAndActivity_ReturnsCandidate(t *testing.T) {
	existing := &domain.Event{ID: "garmin-1", ActivityType: domain.ActivityTypeRun, Date: strPtr("2024-05-01")}
	lister := &stubLister{events: []*domain.Event{existing}}
	incoming := &domain.Event{ActivityType: domain.ActivityTypeRun, Date: strPtr("2024-05-01")}
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || got.ID != "garmin-1" {
		t.Errorf("expected garmin-1, got %+v", got)
	}
}

func TestFindMergeCandidates_MatchOnStartDate(t *testing.T) {
	existing := &domain.Event{ID: "e1", ActivityType: domain.ActivityTypeHike, Date: strPtr("2024-07-10")}
	lister := &stubLister{events: []*domain.Event{existing}}
	// Incoming uses start_date instead of date.
	incoming := &domain.Event{ActivityType: domain.ActivityTypeHike, StartDate: strPtr("2024-07-10")}
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || got.ID != "e1" {
		t.Errorf("expected e1, got %+v", got)
	}
}

func TestFindMergeCandidates_SoftDeletedEventNotReturned(t *testing.T) {
	// The stub returns whatever the lister returns; soft-delete filtering is
	// enforced by db.ListEvents. A stub that returns no events (simulating the
	// filtered result) should yield nil.
	lister := &stubLister{events: []*domain.Event{}} // DB has filtered out soft-deleted
	incoming := &domain.Event{ActivityType: domain.ActivityTypeRun, Date: strPtr("2024-05-01")}
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil when lister returns no events (soft-deleted filtered), got %+v", got)
	}
}

func TestFindMergeCandidates_NonCanonicalEventNotReturned(t *testing.T) {
	// Same as above: db.ListEvents excludes non-canonical rows. Stub returns
	// empty slice to confirm FindMergeCandidates returns nil in that case.
	lister := &stubLister{events: []*domain.Event{}} // DB has filtered out non-canonical
	incoming := &domain.Event{ActivityType: domain.ActivityTypeRun, Date: strPtr("2024-05-01")}
	got, err := merge.FindMergeCandidates(context.Background(), lister, incoming)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil when lister returns no events (non-canonical filtered), got %+v", got)
	}
}

// --- MergeFields ---

func TestMergeFields_ManualWinsOverGarmin(t *testing.T) {
	m := merge.New([]string{"garmin", "strava"})
	manualSrc := "manual"
	garminSrc := "garmin"
	manualTitle := "My Run"
	garminTitle := "Morning Activity"
	canonical := &domain.Event{Title: manualTitle, SourceService: &manualSrc}
	linked := []*domain.Event{
		{Title: garminTitle, SourceService: &garminSrc},
	}
	result := m.MergeFields(canonical, linked)
	if result.Title != "My Run" {
		t.Errorf("title: got %q, want %q", result.Title, "My Run")
	}
}

func TestMergeFields_FallsBackToGarminWhenManualNull(t *testing.T) {
	m := merge.New([]string{"garmin", "strava"})
	manualSrc := "manual"
	garminSrc := "garmin"
	garminLabel := "10K Race"
	canonical := &domain.Event{Title: "My Run", SourceService: &manualSrc} // no label
	linked := []*domain.Event{
		{Title: "Garmin Run", Label: &garminLabel, SourceService: &garminSrc},
	}
	result := m.MergeFields(canonical, linked)
	if result.Label == nil || *result.Label != "10K Race" {
		t.Errorf("label: got %v, want 10K Race", result.Label)
	}
}

func TestMergeFields_UsesPriorityOrderWhenNoManual(t *testing.T) {
	m := merge.New([]string{"garmin", "strava"})
	garminSrc := "garmin"
	stravaSrc := "strava"
	garminTitle := "Garmin Run"
	stravaTitle := "Strava Run"
	canonical := &domain.Event{Title: garminTitle, SourceService: &garminSrc}
	linked := []*domain.Event{
		{Title: stravaTitle, SourceService: &stravaSrc},
	}
	result := m.MergeFields(canonical, linked)
	if result.Title != "Garmin Run" {
		t.Errorf("title: got %q, want Garmin Run (garmin has higher priority)", result.Title)
	}
}

func TestMergeFields_SingleEventNoLinked(t *testing.T) {
	m := merge.New([]string{"garmin"})
	src := "garmin"
	label := "Solo"
	canonical := &domain.Event{Title: "Only Event", Label: &label, SourceService: &src}
	result := m.MergeFields(canonical, nil)
	if result.Title != "Only Event" {
		t.Errorf("title: got %q, want Only Event", result.Title)
	}
	if result.Label == nil || *result.Label != "Solo" {
		t.Errorf("label: got %v, want Solo", result.Label)
	}
}
