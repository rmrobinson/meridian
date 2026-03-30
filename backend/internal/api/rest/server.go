package rest

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
)

const defaultRequestTimeout = 30 * time.Second

// Server is the REST API server.
type Server struct {
	cfg    *config.Config
	db     *db.DB
	logger *zap.Logger
	mux    *http.ServeMux
}

// NewServer constructs a Server and registers all routes.
func NewServer(cfg *config.Config, database *db.DB, logger *zap.Logger) *Server {
	s := &Server{
		cfg:    cfg,
		db:     database,
		logger: logger,
		mux:    http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	withJWT := func(h http.HandlerFunc) http.Handler {
		return timeoutMiddleware(defaultRequestTimeout, jwtMiddleware(s.cfg.Auth.JWTSecret, h))
	}
	s.mux.Handle("GET /api/lines", withJWT(s.handleGetLines))
	s.mux.Handle("GET /api/events", withJWT(s.handleGetEvents))
	s.mux.Handle("GET /api/events/{id}", withJWT(s.handleGetEventByID))
	s.mux.Handle("GET /api/timeline", withJWT(s.handleGetTimeline))
}

// timeoutMiddleware wraps a handler with a per-request context deadline.
func timeoutMiddleware(d time.Duration, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), d)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ServeHTTP implements http.Handler so Server can be passed directly to
// httptest.NewServer in tests. All requests pass through the logging middleware.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	loggingMiddleware(s.logger, s.mux).ServeHTTP(w, r)
}

// Addr returns the address string for use with http.ListenAndServe.
func (s *Server) Addr() string {
	return fmt.Sprintf(":%d", s.cfg.Server.RESTPort)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
