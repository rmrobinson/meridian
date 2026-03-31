package grpc

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

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

// NewGRPCServer creates a grpc.Server with auth and logging interceptors
// registered and the TimelineService implementation bound.
func NewGRPCServer(cfg *config.Config, database *db.DB, logger *zap.Logger, bookEnricher, filmTVEnricher domain.Enricher) *grpc.Server {
	s := NewServer(cfg, database, logger, bookEnricher, filmTVEnricher)
	gs := grpc.NewServer(grpc.ChainUnaryInterceptor(
		s.requestIDInterceptor,
		s.authInterceptor,
		s.loggingInterceptor,
	))
	pb.RegisterTimelineServiceServer(gs, s)
	return gs
}

const grpcRequestIDKey = "x-request-id"

type grpcRequestIDContextKey struct{}

func generateRequestID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// requestIDInterceptor reads x-request-id from incoming gRPC metadata. If
// absent, a new ID is generated. The ID is stored in the context and sent
// back in the response header so clients can correlate log entries.
func (s *Server) requestIDInterceptor(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	id := ""
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if vals := md.Get(grpcRequestIDKey); len(vals) > 0 {
			id = vals[0]
		}
	}
	if id == "" {
		id = generateRequestID()
	}

	if err := grpc.SetHeader(ctx, metadata.Pairs(grpcRequestIDKey, id)); err != nil {
		s.logger.Warn("setting request-id response header", zap.Error(err))
	}

	ctx = context.WithValue(ctx, grpcRequestIDContextKey{}, id)
	return handler(ctx, req)
}

// Addr returns the listen address for the gRPC server.
func Addr(cfg *config.Config) string {
	return fmt.Sprintf(":%d", cfg.Server.GRPCPort)
}

// loggingInterceptor logs the RPC method, response code, latency, and request
// ID. It must run after requestIDInterceptor so the ID is in context.
func (s *Server) loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	start := time.Now()
	resp, err := handler(ctx, req)
	code := status.Code(err)
	requestID, _ := ctx.Value(grpcRequestIDContextKey{}).(string)
	s.logger.Info("grpc request",
		zap.String("request_id", requestID),
		zap.String("method", info.FullMethod),
		zap.String("code", code.String()),
		zap.Duration("latency", time.Since(start)),
	)
	return resp, err
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

	requestID, _ := ctx.Value(grpcRequestIDContextKey{}).(string)
	s.logger.Info("authenticated write request",
		zap.String("request_id", requestID),
		zap.String("token_name", name),
	)
	return handler(ctx, req)
}
