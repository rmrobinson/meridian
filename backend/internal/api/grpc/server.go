package grpc

import (
	"context"
	"fmt"
	"strings"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/auth"
	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// Server is the gRPC API server.
type Server struct {
	pb.UnimplementedTimelineServiceServer
	cfg            *config.Config
	db             *db.DB
	logger         *zap.Logger
	bookEnricher   domain.Enricher
	filmTVEnricher domain.Enricher
}

// NewServer constructs a Server with optional enrichers.
// Pass nil for an enricher to disable enrichment for that family.
func NewServer(cfg *config.Config, database *db.DB, logger *zap.Logger, bookEnricher, filmTVEnricher domain.Enricher) *Server {
	return &Server{
		cfg:            cfg,
		db:             database,
		logger:         logger,
		bookEnricher:   bookEnricher,
		filmTVEnricher: filmTVEnricher,
	}
}

// NewGRPCServer creates a grpc.Server with the bearer token auth interceptor
// registered and the TimelineService implementation bound.
func NewGRPCServer(cfg *config.Config, database *db.DB, logger *zap.Logger, bookEnricher, filmTVEnricher domain.Enricher) *grpc.Server {
	s := NewServer(cfg, database, logger, bookEnricher, filmTVEnricher)
	gs := grpc.NewServer(grpc.UnaryInterceptor(s.authInterceptor))
	pb.RegisterTimelineServiceServer(gs, s)
	return gs
}

// Addr returns the listen address for the gRPC server.
func Addr(cfg *config.Config) string {
	return fmt.Sprintf(":%d", cfg.Server.GRPCPort)
}

// authInterceptor extracts the Bearer token from incoming metadata and
// validates it against configured write tokens. The matched token name is
// logged; the raw token is never logged.
func (s *Server) authInterceptor(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing metadata")
	}

	values := md.Get("authorization")
	if len(values) == 0 {
		return nil, status.Error(codes.Unauthenticated, "missing authorization header")
	}

	rawToken := strings.TrimPrefix(values[0], "Bearer ")
	if rawToken == values[0] {
		return nil, status.Error(codes.Unauthenticated, "authorization header must use Bearer scheme")
	}

	name, err := auth.ValidateWriteToken(rawToken, s.cfg.Auth.WriteTokens)
	if err != nil {
		return nil, status.Error(codes.Unauthenticated, "invalid token")
	}

	s.logger.Info("authenticated write request", zap.String("token_name", name))
	return handler(ctx, req)
}
