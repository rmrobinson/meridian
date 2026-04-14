package rest

import (
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// restrictedPublicMilestoneTypes are life milestone types hidden from
// unauthenticated and public-only callers. relocation and graduation remain
// visible publicly; birth, death, marriage, and anniversary do not.
var restrictedPublicMilestoneTypes = map[string]bool{
	"birth":       true,
	"death":       true,
	"marriage":    true,
	"anniversary": true,
}

// callerHasFriendsOrAbove returns true when the caller's allowed visibility set
// contains at least friends-level access.
func callerHasFriendsOrAbove(visibilities []domain.Visibility) bool {
	for _, v := range visibilities {
		if v == domain.VisibilityFriends || v == domain.VisibilityFamily || v == domain.VisibilityPersonal {
			return true
		}
	}
	return false
}

// filterRestrictedLifeEvents removes events whose life milestone type is in
// restrictedPublicMilestoneTypes when the caller only has public visibility.
// All events are returned unchanged for callers with friends-or-above access.
func filterRestrictedLifeEvents(events []*domain.Event, visibilities []domain.Visibility) []*domain.Event {
	if callerHasFriendsOrAbove(visibilities) {
		return events
	}
	filtered := make([]*domain.Event, 0, len(events))
	for _, e := range events {
		if isRestrictedLifeEvent(e) {
			continue
		}
		filtered = append(filtered, e)
	}
	return filtered
}

// isRestrictedLifeEvent returns true when an event carries a life milestone type
// that is hidden from public/unauthenticated callers. It checks the metadata JSON
// directly so that events missing the metadata_type column are still caught.
func isRestrictedLifeEvent(e *domain.Event) bool {
	if e.Metadata == nil {
		return false
	}
	meta, err := domain.ParseMetadata[domain.LifeMetadata](e)
	if err != nil {
		return false
	}
	return restrictedPublicMilestoneTypes[meta.MilestoneType]
}
