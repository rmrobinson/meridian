package rest

import (
	"encoding/json"
	"fmt"
	"net/http"

	"go.uber.org/zap"

	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
)

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
		return jwtMiddleware(s.cfg.Auth.JWTSecret, h)
	}
	s.mux.Handle("GET /api/lines", withJWT(s.handleGetLines))
	s.mux.Handle("GET /api/events", withJWT(s.handleGetEvents))
	s.mux.Handle("GET /api/events/{id}", withJWT(s.handleGetEventByID))
	s.mux.Handle("GET /api/timeline", withJWT(s.handleGetTimeline))
}

// ServeHTTP implements http.Handler so Server can be passed directly to
// httptest.NewServer in tests.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
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
