package rest

import (
	"context"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
)

type contextKey string

const claimsKey contextKey = "claims"

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
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
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

// loggingMiddleware logs method, path, status code, and latency for every request.
func loggingMiddleware(logger *zap.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(lw, r)
		logger.Info("http request",
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.Int("status", lw.status),
			zap.Duration("latency", time.Since(start)),
		)
	})
}
