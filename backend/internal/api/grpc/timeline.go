package grpc

import (
	"context"
	"errors"
	"time"

	"github.com/jaevor/go-nanoid"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
	"github.com/rmrobinson/meridian/backend/internal/merge"
)

var newID func() string

func init() {
	gen, err := nanoid.Standard(21)
	if err != nil {
		panic(err)
	}
	newID = gen
}

var validFamilyIDs = map[string]bool{
	"spine": true, "employment": true, "education": true, "hobbies": true,
	"travel": true, "flights": true, "books": true, "film_tv": true, "fitness": true,
}

func (s *Server) CreateEvent(ctx context.Context, req *pb.CreateEventRequest) (*pb.CreateEventResponse, error) {
	if req.Title == "" {
		return nil, status.Error(codes.InvalidArgument, "title is required")
	}
	if !validFamilyIDs[req.FamilyId] {
		return nil, status.Errorf(codes.InvalidArgument, "unknown family_id: %q", req.FamilyId)
	}

	id := req.Id
	if id == "" {
		id = newID()
	}

	vis := protoToVisibility(req.Visibility)
	if vis == "" {
		vis = domain.VisibilityPersonal
	}

	now := time.Now().UTC()
	e := &domain.Event{
		ID:            id,
		FamilyID:      req.FamilyId,
		LineKey:       req.LineKey,
		ParentLineKey: strPtr(req.ParentLineKey),
		Type:          protoToEventType(req.Type),
		ActivityType:  protoToActivityType(req.ActivityType),
		Title:         req.Title,
		Label:         strPtr(req.Label),
		Icon:          strPtr(req.Icon),
		EndIcon:       strPtr(req.EndIcon),
		Description:   strPtr(req.Description),
		Date:          strPtr(req.Date),
		StartDate:     strPtr(req.StartDate),
		EndDate:       strPtr(req.EndDate),
		ExternalURL:   strPtr(req.ExternalUrl),
		HeroImageURL:  strPtr(req.HeroImageUrl),
		Metadata:      strPtr(req.Metadata),
		Visibility:    vis,
		SourceEventID: strPtr(req.SourceEventId),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if req.Location != nil {
		e.LocationLabel = strPtr(req.Location.Label)
		e.LocationLat = float64Ptr(req.Location.Lat)
		e.LocationLng = float64Ptr(req.Location.Lng)
	}

	if err := domain.ValidateMetadata(e.FamilyID, e); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid metadata: %v", err)
	}

	// Enrich before insert — fail fast if enrichment errors.
	if enrichErr := s.enrich(ctx, e); enrichErr != nil {
		s.logger.Error("enriching event", zap.String("family_id", e.FamilyID), zap.Error(enrichErr))
		return nil, status.Errorf(codes.Internal, "enrichment failed: %v", enrichErr)
	}

	if err := s.db.CreateEvent(ctx, e); err != nil {
		if isUniqueConstraint(err) {
			return nil, status.Errorf(codes.AlreadyExists, "event with id %q already exists", id)
		}
		s.logger.Error("creating event", zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	return &pb.CreateEventResponse{Event: eventToProto(e, nil)}, nil
}

func (s *Server) UpdateEvent(ctx context.Context, req *pb.UpdateEventRequest) (*pb.UpdateEventResponse, error) {
	if req.Title == "" {
		return nil, status.Error(codes.InvalidArgument, "title is required")
	}

	vis := protoToVisibility(req.Visibility)
	if vis == "" {
		vis = domain.VisibilityPersonal
	}

	e := &domain.Event{
		ID:            req.Id,
		FamilyID:      req.FamilyId,
		LineKey:       req.LineKey,
		ParentLineKey: strPtr(req.ParentLineKey),
		Type:          protoToEventType(req.Type),
		ActivityType:  protoToActivityType(req.ActivityType),
		Title:         req.Title,
		Label:         strPtr(req.Label),
		Icon:          strPtr(req.Icon),
		EndIcon:       strPtr(req.EndIcon),
		Description:   strPtr(req.Description),
		Date:          strPtr(req.Date),
		StartDate:     strPtr(req.StartDate),
		EndDate:       strPtr(req.EndDate),
		ExternalURL:   strPtr(req.ExternalUrl),
		HeroImageURL:  strPtr(req.HeroImageUrl),
		Metadata:      strPtr(req.Metadata),
		Visibility:    vis,
	}
	if req.Location != nil {
		e.LocationLabel = strPtr(req.Location.Label)
		e.LocationLat = float64Ptr(req.Location.Lat)
		e.LocationLng = float64Ptr(req.Location.Lng)
	}

	if err := domain.ValidateMetadata(e.FamilyID, e); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid metadata: %v", err)
	}

	if err := s.db.UpdateEvent(ctx, e); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "event %q not found", req.Id)
		}
		s.logger.Error("updating event", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	updated, err := s.db.GetEventByID(ctx, req.Id)
	if err != nil {
		s.logger.Error("fetching updated event", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}
	photos, err := s.db.ListPhotosForEvent(ctx, req.Id)
	if err != nil {
		s.logger.Error("listing photos for updated event", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}
	return &pb.UpdateEventResponse{Event: eventToProto(updated, photos)}, nil
}

func (s *Server) ListEvents(ctx context.Context, req *pb.ListEventsRequest) (*pb.ListEventsResponse, error) {
	f := db.ListEventsFilter{
		FamilyID: req.FamilyId,
		From:     req.From,
		To:       req.To,
	}
	for _, v := range req.Visibilities {
		f.Visibilities = append(f.Visibilities, protoToVisibility(v))
	}

	events, err := s.db.ListEvents(ctx, f)
	if err != nil {
		s.logger.Error("listing events", zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	resp := &pb.ListEventsResponse{
		Events: make([]*pb.Event, 0, len(events)),
	}
	for _, e := range events {
		photos, err := s.db.ListPhotosForEvent(ctx, e.ID)
		if err != nil {
			s.logger.Error("listing photos for event", zap.String("id", e.ID), zap.Error(err))
			return nil, status.Error(codes.Internal, "internal error")
		}
		resp.Events = append(resp.Events, eventToProto(e, photos))
	}
	return resp, nil
}

func (s *Server) ImportEvents(ctx context.Context, req *pb.ImportEventsRequest) (*pb.ImportEventsResponse, error) {
	resp := &pb.ImportEventsResponse{}

	for _, evtReq := range req.Events {
		if evtReq.Title == "" {
			resp.Failed++
			resp.Errors = append(resp.Errors, "event missing title")
			continue
		}

		// Check for an existing row from the same source.
		if req.SourceService != "" && evtReq.SourceEventId != "" {
			existing, err := s.db.GetEventBySourceID(ctx, req.SourceService, evtReq.SourceEventId)
			if err == nil {
				// Row exists — apply conflict strategy.
				switch req.ConflictStrategy {
				case pb.ConflictStrategy_CONFLICT_STRATEGY_SKIP:
					resp.Skipped++
					continue
				case pb.ConflictStrategy_CONFLICT_STRATEGY_UPSERT:
					vis := protoToVisibility(evtReq.Visibility)
					if vis == "" {
						vis = domain.VisibilityPersonal
					}
					updated := &domain.Event{
						ID:            existing.ID,
						FamilyID:      evtReq.FamilyId,
						LineKey:       evtReq.LineKey,
						ParentLineKey: strPtr(evtReq.ParentLineKey),
						Type:          protoToEventType(evtReq.Type),
						ActivityType:  protoToActivityType(evtReq.ActivityType),
						Title:         evtReq.Title,
						Label:         strPtr(evtReq.Label),
						Icon:          strPtr(evtReq.Icon),
						EndIcon:       strPtr(evtReq.EndIcon),
						Description:   strPtr(evtReq.Description),
						Date:          strPtr(evtReq.Date),
						StartDate:     strPtr(evtReq.StartDate),
						EndDate:       strPtr(evtReq.EndDate),
						ExternalURL:   strPtr(evtReq.ExternalUrl),
						HeroImageURL:  strPtr(evtReq.HeroImageUrl),
						Metadata:      strPtr(evtReq.Metadata),
						Visibility:    vis,
						SourceEventID: strPtr(evtReq.SourceEventId),
					}
					if req.SourceService != "" {
						updated.SourceService = &req.SourceService
					}
					if evtReq.Location != nil {
						updated.LocationLabel = strPtr(evtReq.Location.Label)
						updated.LocationLat = float64Ptr(evtReq.Location.Lat)
						updated.LocationLng = float64Ptr(evtReq.Location.Lng)
					}
					if dbErr := s.db.UpdateEvent(ctx, updated); dbErr != nil {
						resp.Failed++
						resp.Errors = append(resp.Errors, "failed to update event: "+evtReq.SourceEventId)
						continue
					}
					resp.Updated++
					continue
				}
			} else if !errors.Is(err, db.ErrNotFound) {
				s.logger.Error("checking source event", zap.Error(err))
				resp.Failed++
				resp.Errors = append(resp.Errors, "internal error checking source event")
				continue
			}
		}

		// New event — generate ID if absent.
		id := evtReq.Id
		if id == "" {
			id = newID()
		}

		vis := protoToVisibility(evtReq.Visibility)
		if vis == "" {
			vis = domain.VisibilityPersonal
		}

		now := time.Now().UTC()
		e := &domain.Event{
			ID:            id,
			FamilyID:      evtReq.FamilyId,
			LineKey:       evtReq.LineKey,
			ParentLineKey: strPtr(evtReq.ParentLineKey),
			Type:          protoToEventType(evtReq.Type),
			ActivityType:  protoToActivityType(evtReq.ActivityType),
			Title:         evtReq.Title,
			Label:         strPtr(evtReq.Label),
			Icon:          strPtr(evtReq.Icon),
			EndIcon:       strPtr(evtReq.EndIcon),
			Description:   strPtr(evtReq.Description),
			Date:          strPtr(evtReq.Date),
			StartDate:     strPtr(evtReq.StartDate),
			EndDate:       strPtr(evtReq.EndDate),
			ExternalURL:   strPtr(evtReq.ExternalUrl),
			HeroImageURL:  strPtr(evtReq.HeroImageUrl),
			Metadata:      strPtr(evtReq.Metadata),
			Visibility:    vis,
			SourceEventID: strPtr(evtReq.SourceEventId),
			CreatedAt:     now,
			UpdatedAt:     now,
		}
		if req.SourceService != "" {
			e.SourceService = &req.SourceService
		}
		if evtReq.Location != nil {
			e.LocationLabel = strPtr(evtReq.Location.Label)
			e.LocationLat = float64Ptr(evtReq.Location.Lat)
			e.LocationLng = float64Ptr(evtReq.Location.Lng)
		}

		// Auto-merge: find a canonical event matching date + activity_type.
		if candidate, err := merge.FindMergeCandidates(ctx, s.db, e); err == nil && candidate != nil {
			e.CanonicalID = &candidate.ID
		}

		if dbErr := s.db.CreateEvent(ctx, e); dbErr != nil {
			s.logger.Error("importing event", zap.Error(dbErr))
			resp.Failed++
			resp.Errors = append(resp.Errors, "failed to create event")
			continue
		}
		resp.Created++
	}

	return resp, nil
}

func (s *Server) DeleteEvent(ctx context.Context, req *pb.DeleteEventRequest) (*pb.DeleteEventResponse, error) {
	if err := s.db.SoftDeleteEvent(ctx, req.Id); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "event %q not found", req.Id)
		}
		s.logger.Error("deleting event", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}
	return &pb.DeleteEventResponse{}, nil
}

// enrich calls the appropriate enricher for the event's family, if one is configured.
func (s *Server) enrich(ctx context.Context, e *domain.Event) error {
	switch e.FamilyID {
	case "books":
		if s.bookEnricher != nil {
			return s.bookEnricher.Enrich(ctx, e)
		}
	case "film_tv":
		if s.filmTVEnricher != nil {
			return s.filmTVEnricher.Enrich(ctx, e)
		}
	}
	return nil
}

// isUniqueConstraint returns true if err is a SQLite UNIQUE constraint violation.
func isUniqueConstraint(err error) bool {
	return err != nil && (contains(err.Error(), "UNIQUE constraint failed") ||
		contains(err.Error(), "unique constraint"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
