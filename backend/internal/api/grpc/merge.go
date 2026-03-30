package grpc

import (
	"context"
	"errors"

	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/db"
)

func (s *Server) MergeEvents(ctx context.Context, req *pb.MergeEventsRequest) (*pb.MergeEventsResponse, error) {
	// Verify the canonical event exists.
	canonical, err := s.db.GetEventByID(ctx, req.CanonicalId)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "canonical event %q not found", req.CanonicalId)
		}
		s.logger.Error("fetching canonical event", zap.String("id", req.CanonicalId), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	// Verify all linked event IDs exist before making any changes.
	for _, id := range req.EventIds {
		if _, err := s.db.GetEventByID(ctx, id); err != nil {
			if errors.Is(err, db.ErrNotFound) {
				return nil, status.Errorf(codes.InvalidArgument, "event %q not found", id)
			}
			s.logger.Error("fetching event for merge", zap.String("id", id), zap.Error(err))
			return nil, status.Error(codes.Internal, "internal error")
		}
	}

	// Set canonical_id on each linked event.
	for _, id := range req.EventIds {
		if err := s.db.SetCanonicalID(ctx, id, req.CanonicalId); err != nil {
			s.logger.Error("setting canonical_id", zap.String("id", id), zap.Error(err))
			return nil, status.Error(codes.Internal, "internal error")
		}
	}

	photos, err := s.db.ListPhotosForEvent(ctx, canonical.ID)
	if err != nil {
		s.logger.Error("listing photos for canonical event", zap.String("id", canonical.ID), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}
	return &pb.MergeEventsResponse{Event: eventToProto(canonical, photos)}, nil
}

func (s *Server) UnmergeEvent(ctx context.Context, req *pb.UnmergeEventRequest) (*pb.UnmergeEventResponse, error) {
	if err := s.db.ClearCanonicalID(ctx, req.Id); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "event %q not found", req.Id)
		}
		s.logger.Error("clearing canonical_id", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	event, err := s.db.GetEventByID(ctx, req.Id)
	if err != nil {
		s.logger.Error("fetching unmerged event", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	photos, err := s.db.ListPhotosForEvent(ctx, req.Id)
	if err != nil {
		s.logger.Error("listing photos for unmerged event", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}
	return &pb.UnmergeEventResponse{Event: eventToProto(event, photos)}, nil
}
