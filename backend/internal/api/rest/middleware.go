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
