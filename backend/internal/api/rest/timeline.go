package rest

import (
	"net/http"

	"go.uber.org/zap"

	"github.com/rmrobinson/meridian/backend/internal/db"
)

type personResponse struct {
	Name      string `json:"name"`
	BirthDate string `json:"birth_date"`
}

type timelineResponse struct {
	Person   personResponse       `json:"person"`
	Families []lineFamilyResponse `json:"line_families"`
	Events   []eventResponse      `json:"events"`
}

func (s *Server) handleGetTimeline(w http.ResponseWriter, r *http.Request) {
	visibilities := callerVisibilities(r)

	events, err := s.db.ListEvents(r.Context(), db.ListEventsFilter{
		Visibilities: visibilities,
	})
	if err != nil {
		s.logger.Error("listing events for timeline", zap.Error(err))
		s.writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	events = filterRestrictedLifeEvents(events, visibilities)

	eventResps := make([]eventResponse, 0, len(events))
	for _, e := range events {
		photos, err := s.db.ListPhotosForEvent(r.Context(), e.ID)
		if err != nil {
			s.logger.Error("listing photos for timeline", zap.String("event_id", e.ID), zap.Error(err))
			s.writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		eventResps = append(eventResps, toEventResponse(e, photos))
	}

	families := make([]lineFamilyResponse, len(s.cfg.LineFamilies))
	for i, f := range s.cfg.LineFamilies {
		families[i] = lineFamilyResponse{
			ID:             f.ID,
			Label:          f.Label,
			BaseColorHSL:   f.BaseColorHSL,
			Side:           f.Side,
			OnEnd:          f.OnEnd,
			SpawnBehavior:  f.SpawnBehavior,
			ParentFamilyID: f.ParentFamilyID,
		}
	}

	birthDate := ""
	if callerHasFriendsOrAbove(visibilities) {
		birthDate = s.cfg.Person.BirthDate
	}

	resp := timelineResponse{
		Person: personResponse{
			Name:      s.cfg.Person.Name,
			BirthDate: birthDate,
		},
		Families: families,
		Events:   eventResps,
	}

	s.writeJSON(w, http.StatusOK, resp)
}
