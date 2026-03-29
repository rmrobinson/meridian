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

func (s *Server) CreateEvent(ctx context.Context, req *pb.CreateEventRequest) (*pb.Event, error) {
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
		if req.Location.Lat != 0 || req.Location.Lng != 0 {
			e.LocationLat = float64Ptr(req.Location.Lat)
			e.LocationLng = float64Ptr(req.Location.Lng)
		}
	}

	if err := s.db.CreateEvent(ctx, e); err != nil {
		if isUniqueConstraint(err) {
			return nil, status.Errorf(codes.AlreadyExists, "event with id %q already exists", id)
		}
		s.logger.Error("creating event", zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	return eventToProto(e, nil), nil
}

func (s *Server) UpdateEvent(ctx context.Context, req *pb.UpdateEventRequest) (*pb.Event, error) {
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
		if req.Location.Lat != 0 || req.Location.Lng != 0 {
			e.LocationLat = float64Ptr(req.Location.Lat)
			e.LocationLng = float64Ptr(req.Location.Lng)
		}
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
	photos, _ := s.db.ListPhotosForEvent(ctx, req.Id)
	return eventToProto(updated, photos), nil
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
		photos, _ := s.db.ListPhotosForEvent(ctx, e.ID)
		resp.Events = append(resp.Events, eventToProto(e, photos))
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
