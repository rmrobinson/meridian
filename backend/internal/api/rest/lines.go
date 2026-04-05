package rest

import (
	"net/http"
)

type lineFamilyResponse struct {
	ID             string `json:"id"`
	Label          string `json:"label"`
	BaseColorHSL   []int  `json:"base_color_hsl"`
	Side           string `json:"side"`
	OnEnd          string `json:"on_end"`
	SpawnBehavior  string `json:"spawn_behavior"`
	ParentFamilyID string `json:"parent_family_id,omitempty"`
}

func (s *Server) handleGetLines(w http.ResponseWriter, r *http.Request) {
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
	s.writeJSON(w, http.StatusOK, families)
}
