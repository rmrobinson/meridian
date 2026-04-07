package rest

import (
	"encoding/json"
	"errors"
	"net/http"

	"go.uber.org/zap"

	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

type photoResponse struct {
	ID        string `json:"id"`
	S3URL     string `json:"s3_url"`
	Variant   string `json:"variant"`
	SortOrder int    `json:"sort_order"`
}

type locationResponse struct {
	Label string   `json:"label"`
	Lat   *float64 `json:"lat"`
	Lng   *float64 `json:"lng"`
}

type eventResponse struct {
	ID            string          `json:"id"`
	FamilyID      string          `json:"family_id"`
	LineKey       string          `json:"line_key"`
	ParentLineKey *string         `json:"parent_line_key,omitempty"`
	Type          string          `json:"type"`
	Title         string          `json:"title"`
	Label         *string         `json:"label,omitempty"`
	Icon          *string         `json:"icon,omitempty"`
	EndIcon       *string         `json:"end_icon,omitempty"`
	Description   *string         `json:"description,omitempty"`
	Date          *string         `json:"date,omitempty"`
	StartDate     *string         `json:"start_date,omitempty"`
	EndDate       *string         `json:"end_date,omitempty"`
	Location      *locationResponse `json:"location,omitempty"`
	ExternalURL   *string         `json:"external_url,omitempty"`
	HeroImageURL  *string         `json:"hero_image_url,omitempty"`
	Metadata      json.RawMessage `json:"metadata,omitempty"`
	MetadataType  string          `json:"metadata_type,omitempty"`
	Visibility    string          `json:"visibility"`
	Photos        []photoResponse `json:"photos"`
}

func (s *Server) handleGetEvents(w http.ResponseWriter, r *http.Request) {
	visibilities := callerVisibilities(r)

	filter := db.ListEventsFilter{
		FamilyID:     r.URL.Query().Get("family"),
		From:         r.URL.Query().Get("from"),
		To:           r.URL.Query().Get("to"),
		Visibilities: visibilities,
	}

	events, err := s.db.ListEvents(r.Context(), filter)
	if err != nil {
		s.logger.Error("listing events", zap.Error(err))
		s.writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := make([]eventResponse, 0, len(events))
	for _, e := range events {
		photos, err := s.db.ListPhotosForEvent(r.Context(), e.ID)
		if err != nil {
			s.logger.Error("listing photos", zap.String("event_id", e.ID), zap.Error(err))
			s.writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		resp = append(resp, toEventResponse(e, photos))
	}

	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetEventByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	visibilities := callerVisibilities(r)

	e, err := s.db.GetEventByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			s.writeError(w, http.StatusNotFound, "not found")
			return
		}
		s.logger.Error("getting event", zap.String("id", id), zap.Error(err))
		s.writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !visibilityAllowed(e.Visibility, visibilities) {
		s.writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	photos, err := s.db.ListPhotosForEvent(r.Context(), e.ID)
	if err != nil {
		s.logger.Error("listing photos", zap.String("event_id", e.ID), zap.Error(err))
		s.writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	s.writeJSON(w, http.StatusOK, toEventResponse(e, photos))
}

// callerVisibilities returns the visibility levels permitted by the JWT in the
// request context, defaulting to public-only for unauthenticated requests.
func callerVisibilities(r *http.Request) []domain.Visibility {
	claims := claimsFromContext(r.Context())
	if claims == nil {
		return RoleToVisibility("")
	}
	return RoleToVisibility(claims.Role)
}

func visibilityAllowed(v domain.Visibility, allowed []domain.Visibility) bool {
	for _, a := range allowed {
		if a == v {
			return true
		}
	}
	return false
}

func toEventResponse(e *domain.Event, photos []*domain.Photo) eventResponse {
	resp := eventResponse{
		ID:            e.ID,
		FamilyID:      e.FamilyID,
		LineKey:       e.LineKey,
		ParentLineKey: e.ParentLineKey,
		Type:          string(e.Type),
		Title:         e.Title,
		Label:         e.Label,
		Icon:          e.Icon,
		EndIcon:       e.EndIcon,
		Description:   e.Description,
		Date:          e.Date,
		StartDate:     e.StartDate,
		EndDate:       e.EndDate,
		ExternalURL:   e.ExternalURL,
		HeroImageURL:  e.HeroImageURL,
		Visibility:    string(e.Visibility),
		Photos:        make([]photoResponse, 0, len(photos)),
	}
	if e.LocationLabel != nil || e.LocationLat != nil || e.LocationLng != nil {
		resp.Location = &locationResponse{
			Lat: e.LocationLat,
			Lng: e.LocationLng,
		}
		if e.LocationLabel != nil {
			resp.Location.Label = *e.LocationLabel
		}
	}
	if e.Metadata != nil {
		resp.Metadata = json.RawMessage(*e.Metadata)
	}
	if e.MetadataType != nil {
		resp.MetadataType = *e.MetadataType
	}
	for _, p := range photos {
		resp.Photos = append(resp.Photos, photoResponse{
			ID:        p.ID,
			S3URL:     p.S3URL,
			Variant:   string(p.Variant),
			SortOrder: p.SortOrder,
		})
	}
	return resp
}
