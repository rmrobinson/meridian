package grpc

import (
	"context"
	"time"

	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/sharing"
)

// SharingServer implements the gRPC SharingService.
type SharingServer struct {
	pb.UnimplementedSharingServiceServer
	cfg    *config.Config
	store  *sharing.Store
	logger *zap.Logger
}

// NewSharingServer constructs a SharingServer.
func NewSharingServer(cfg *config.Config, store *sharing.Store, logger *zap.Logger) *SharingServer {
	return &SharingServer{cfg: cfg, store: store, logger: logger}
}

// CreateSharingToken generates a new sharing token, persists it to the DB, and
// returns the signed JWT (returned only once) along with the token record.
func (s *SharingServer) CreateSharingToken(ctx context.Context, req *pb.CreateSharingTokenRequest) (*pb.CreateSharingTokenResponse, error) {
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}
	if req.Email == "" {
		return nil, status.Error(codes.InvalidArgument, "email is required")
	}
	if req.Visibility == pb.Visibility_VISIBILITY_UNSPECIFIED {
		return nil, status.Error(codes.InvalidArgument, "visibility is required")
	}

	now := time.Now().UTC()
	t := &sharing.SharingToken{
		ID:         newID(),
		Name:       req.Name,
		Email:      req.Email,
		Visibility: protoToVisibility(req.Visibility),
		CreatedAt:  now,
	}
	if req.ExpiresAt != nil {
		ea := req.ExpiresAt.AsTime().UTC()
		t.ExpiresAt = &ea
	}

	if err := s.store.Create(ctx, t); err != nil {
		s.logger.Error("creating sharing token", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to create sharing token")
	}

	jwt, err := sharing.Issue(t, []byte(s.cfg.Auth.JWTSecret))
	if err != nil {
		s.logger.Error("issuing sharing token JWT", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to issue sharing token")
	}

	s.logger.Info("sharing token created",
		zap.String("id", t.ID),
		zap.String("name", t.Name),
		zap.String("email", t.Email),
		zap.String("visibility", string(t.Visibility)),
	)

	return &pb.CreateSharingTokenResponse{
		Token:  jwt,
		Record: sharingTokenToProto(t),
	}, nil
}

// RevokeSharingToken soft-deletes a sharing token. No-ops silently for unknown IDs.
func (s *SharingServer) RevokeSharingToken(ctx context.Context, req *pb.RevokeSharingTokenRequest) (*pb.RevokeSharingTokenResponse, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	if err := s.store.Revoke(ctx, req.Id); err != nil {
		s.logger.Error("revoking sharing token", zap.String("id", req.Id), zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to revoke sharing token")
	}

	s.logger.Info("sharing token revoked", zap.String("id", req.Id))
	return &pb.RevokeSharingTokenResponse{}, nil
}

// ListSharingTokens returns all sharing tokens, including revoked ones.
func (s *SharingServer) ListSharingTokens(ctx context.Context, _ *pb.ListSharingTokensRequest) (*pb.ListSharingTokensResponse, error) {
	tokens, err := s.store.List(ctx)
	if err != nil {
		s.logger.Error("listing sharing tokens", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to list sharing tokens")
	}

	records := make([]*pb.SharingTokenRecord, len(tokens))
	for i, t := range tokens {
		records[i] = sharingTokenToProto(t)
	}
	return &pb.ListSharingTokensResponse{Tokens: records}, nil
}

// sharingTokenToProto converts a domain SharingToken to its proto representation.
func sharingTokenToProto(t *sharing.SharingToken) *pb.SharingTokenRecord {
	r := &pb.SharingTokenRecord{
		Id:         t.ID,
		Name:       t.Name,
		Email:      t.Email,
		Visibility: visibilityToProto(t.Visibility),
		CreatedAt:  timestamppb.New(t.CreatedAt),
	}
	if t.ExpiresAt != nil {
		r.ExpiresAt = timestamppb.New(*t.ExpiresAt)
	}
	if t.DeletedAt != nil {
		r.DeletedAt = timestamppb.New(*t.DeletedAt)
	}
	return r
}
