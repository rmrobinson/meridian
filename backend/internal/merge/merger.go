package merge

import (
	"context"

	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// EventLister is the subset of db.DB needed by FindMergeCandidates.
type EventLister interface {
	ListEvents(ctx context.Context, f db.ListEventsFilter) ([]*domain.Event, error)
}

// Merger holds the source priority list and exposes merge operations.
type Merger struct {
	SourcePriority []string
}

// New returns a Merger configured with the given source priority order.
func New(sourcePriority []string) *Merger {
	return &Merger{SourcePriority: sourcePriority}
}

// fitnessActivity returns the activity string from a fitness event's metadata,
// or "" if the event is not a fitness event or has no activity set.
func fitnessActivity(e *domain.Event) string {
	if e.FamilyID != "fitness" {
		return ""
	}
	m, err := domain.ParseMetadata[domain.FitnessMetadata](e)
	if err != nil || m == nil {
		return ""
	}
	return m.Activity
}

// FindMergeCandidates searches for an existing canonical event that matches
// the incoming event on date and fitness activity. Returns the best match or nil.
// Only fitness events with a non-empty activity and a date are considered.
func FindMergeCandidates(ctx context.Context, lister EventLister, incoming *domain.Event) (*domain.Event, error) {
	incomingActivity := fitnessActivity(incoming)
	if incomingActivity == "" {
		return nil, nil
	}

	date := ""
	if incoming.Date != nil {
		date = *incoming.Date
	} else if incoming.StartDate != nil {
		date = *incoming.StartDate
	}
	if date == "" {
		return nil, nil
	}

	candidates, err := lister.ListEvents(ctx, db.ListEventsFilter{
		FamilyID: "fitness",
		From:     date,
		To:       date,
	})
	if err != nil {
		return nil, err
	}

	for _, c := range candidates {
		if fitnessActivity(c) == incomingActivity {
			return c, nil
		}
	}
	return nil, nil
}

// MergeFields resolves field values across the canonical and all linked rows
// according to source priority. "manual" always wins regardless of position.
func (m *Merger) MergeFields(canonical *domain.Event, linked []*domain.Event) *domain.Event {
	all := make([]*domain.Event, 0, 1+len(linked))
	all = append(all, canonical)
	all = append(all, linked...)

	priority := make(map[string]int, len(m.SourcePriority))
	for i, s := range m.SourcePriority {
		priority[s] = i
	}

	result := *canonical

	// pick returns the value from the highest-priority non-empty source.
	pick := func(vals []*string, sources []*string) *string {
		var best *string
		bestPrio := len(m.SourcePriority) + 1
		bestIsManual := false
		for i, v := range vals {
			if v == nil || *v == "" {
				continue
			}
			src := ""
			if sources[i] != nil {
				src = *sources[i]
			}
			isManual := src == "manual"
			prio, ok := priority[src]
			if !ok {
				prio = len(m.SourcePriority)
			}
			if best == nil ||
				(isManual && !bestIsManual) ||
				(!bestIsManual && prio < bestPrio) {
				best = v
				bestPrio = prio
				bestIsManual = isManual
			}
		}
		return best
	}

	n := len(all)
	titles := make([]*string, n)
	labels := make([]*string, n)
	icons := make([]*string, n)
	heroURLs := make([]*string, n)
	extURLs := make([]*string, n)
	metadatas := make([]*string, n)
	sources := make([]*string, n)

	for i, e := range all {
		t := e.Title
		titles[i] = &t
		labels[i] = e.Label
		icons[i] = e.Icon
		heroURLs[i] = e.HeroImageURL
		extURLs[i] = e.ExternalURL
		metadatas[i] = e.Metadata
		sources[i] = e.SourceService
	}

	if v := pick(titles, sources); v != nil {
		result.Title = *v
	}
	result.Label = pick(labels, sources)
	result.Icon = pick(icons, sources)
	result.HeroImageURL = pick(heroURLs, sources)
	result.ExternalURL = pick(extURLs, sources)
	result.Metadata = pick(metadatas, sources)

	return &result
}
