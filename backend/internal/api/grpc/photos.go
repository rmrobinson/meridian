package grpc

import (
	"context"
	"errors"

	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

func (s *Server) AddPhoto(ctx context.Context, req *pb.AddPhotoRequest) (*pb.Photo, error) {
	// Determine the next sort_order by counting existing photos.
	existing, err := s.db.ListPhotosForEvent(ctx, req.EventId)
	if err != nil {
		s.logger.Error("listing photos for sort order", zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	p := &domain.Photo{
		ID:        newID(),
		EventID:   req.EventId,
		S3URL:     req.S3Url,
		Variant:   domain.PhotoVariant(req.Variant),
		SortOrder: len(existing),
	}

	if err := s.db.AddPhoto(ctx, p); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "event %q not found", req.EventId)
		}
		// Foreign key violation means the event doesn't exist.
		if isUniqueConstraint(err) || isForeignKeyViolation(err) {
			return nil, status.Errorf(codes.NotFound, "event %q not found", req.EventId)
		}
		s.logger.Error("adding photo", zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	return photoToProto(p), nil
}

func (s *Server) RemovePhoto(ctx context.Context, req *pb.RemovePhotoRequest) (*pb.RemovePhotoResponse, error) {
	if err := s.db.RemovePhoto(ctx, req.Id); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "photo %q not found", req.Id)
		}
		s.logger.Error("removing photo", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}
	return &pb.RemovePhotoResponse{}, nil
}

func (s *Server) ReorderPhotos(ctx context.Context, req *pb.ReorderPhotosRequest) (*pb.Event, error) {
	// Validate that all submitted IDs belong to the event and are complete.
	existing, err := s.db.ListPhotosForEvent(ctx, req.EventId)
	if err != nil {
		s.logger.Error("listing photos for reorder", zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	if len(req.PhotoIds) != len(existing) {
		return nil, status.Errorf(codes.InvalidArgument,
			"photo_ids must include all %d photos for the event", len(existing))
	}

	existingIDs := make(map[string]bool, len(existing))
	for _, p := range existing {
		existingIDs[p.ID] = true
	}
	for _, id := range req.PhotoIds {
		if !existingIDs[id] {
			return nil, status.Errorf(codes.InvalidArgument, "photo %q does not belong to event %q", id, req.EventId)
		}
	}

	if err := s.db.ReorderPhotos(ctx, req.EventId, req.PhotoIds); err != nil {
		s.logger.Error("reordering photos", zap.Error(err))
		return nil, status.Error(codes.Internal, "internal error")
	}

	event, err := s.db.GetEventByID(ctx, req.EventId)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "event %q not found", req.EventId)
		}
		return nil, status.Error(codes.Internal, "internal error")
	}

	photos, _ := s.db.ListPhotosForEvent(ctx, req.EventId)
	return eventToProto(event, photos), nil
}

func isForeignKeyViolation(err error) bool {
	return err != nil && containsStr(err.Error(), "FOREIGN KEY constraint failed")
}
