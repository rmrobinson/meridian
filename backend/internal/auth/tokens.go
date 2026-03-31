package auth

import (
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"github.com/rmrobinson/meridian/backend/internal/config"
)

// ErrInvalidToken is returned when no configured token matches the raw token.
var ErrInvalidToken = errors.New("invalid token")

// ValidateWriteToken bcrypt-compares rawToken against every configured write
// token hash. It returns the matched token's name on success, so callers can
// log it for auditability without logging the raw token.
func ValidateWriteToken(rawToken string, tokens []config.WriteToken) (string, error) {
	if rawToken == "" {
		return "", ErrInvalidToken
	}
	for _, t := range tokens {
		if err := bcrypt.CompareHashAndPassword([]byte(t.TokenHash), []byte(rawToken)); err == nil {
			return t.Name, nil
		}
	}
	return "", fmt.Errorf("%w: no matching token", ErrInvalidToken)
}
