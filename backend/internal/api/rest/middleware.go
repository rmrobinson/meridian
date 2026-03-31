package rest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
)

type contextKey string

const (
	claimsKey    contextKey = "claims"
	requestIDKey contextKey = "request_id"
)

// requestIDHeader is the canonical header name used to carry the request ID
// both inbound (from the client) and outbound (echo back in the response).
const requestIDHeader = "X-Request-ID"

// generateRequestID returns a cryptographically random 24-character hex string.
func generateRequestID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// requestIDMiddleware reads X-Request-ID from the incoming request. If absent,
// a new ID is generated. The ID is stored in the request context and written
// back as X-Request-ID on the response so clients can correlate log entries.
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(requestIDHeader)
		if id == "" {
			id = generateRequestID()
		}
		w.Header().Set(requestIDHeader, id)
		r = r.WithContext(context.WithValue(r.Context(), requestIDKey, id))
		next.ServeHTTP(w, r)
	})
}

// requestIDFromContext returns the request ID stored by requestIDMiddleware,
// or an empty string if the middleware was not in the chain.
func requestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

// jwtMiddleware extracts and validates the Bearer token from the Authorization
// header. Requests with no token proceed as unauthenticated — this is not an
// error on read endpoints.
func jwtMiddleware(secret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			if claims, err := ValidateToken(tokenString, secret); err == nil {
				r = r.WithContext(context.WithValue(r.Context(), claimsKey, claims))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// claimsFromContext retrieves the JWT claims from the request context, or nil
// for unauthenticated requests.
func claimsFromContext(ctx context.Context) *Claims {
	claims, _ := ctx.Value(claimsKey).(*Claims)
	return claims
}

// loggingResponseWriter wraps http.ResponseWriter to capture the status code.
type loggingResponseWriter struct {
	http.ResponseWriter
	status int
}

func (lw *loggingResponseWriter) WriteHeader(code int) {
	lw.status = code
	lw.ResponseWriter.WriteHeader(code)
}

// corsMiddleware sets Access-Control-Allow-* headers when the request Origin
// matches one of the allowed origins. Preflight OPTIONS requests are answered
// immediately with 204. If allowedOrigins is empty, no CORS headers are set.
func corsMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowed[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
				w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
				w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
				w.Header().Set("Vary", "Origin")
			}
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// loggingMiddleware logs method, path, status code, latency, and request ID
// for every request. It must run after requestIDMiddleware so the ID is
// available in the context.
func loggingMiddleware(logger *zap.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(lw, r)
		logger.Info("http request",
			zap.String("request_id", requestIDFromContext(r.Context())),
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.Int("status", lw.status),
			zap.Duration("latency", time.Since(start)),
		)
	})
}
