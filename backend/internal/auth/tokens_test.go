package auth_test

import (
	"errors"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/rmrobinson/meridian/backend/internal/auth"
	"github.com/rmrobinson/meridian/backend/internal/config"
)

func hashToken(t *testing.T, raw string) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(raw), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hashing token: %v", err)
	}
	return string(h)
}

func TestValidateWriteToken_ValidToken(t *testing.T) {
	raw := "supersecrettoken"
	tokens := []config.WriteToken{
		{Name: "cli", TokenHash: hashToken(t, raw)},
	}
	name, err := auth.ValidateWriteToken(raw, tokens)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if name != "cli" {
		t.Errorf("name: got %q, want %q", name, "cli")
	}
}

func TestValidateWriteToken_InvalidToken(t *testing.T) {
	tokens := []config.WriteToken{
		{Name: "cli", TokenHash: hashToken(t, "correcttoken")},
	}
	_, err := auth.ValidateWriteToken("wrongtoken", tokens)
	if !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateWriteToken_EmptyToken(t *testing.T) {
	tokens := []config.WriteToken{
		{Name: "cli", TokenHash: hashToken(t, "correcttoken")},
	}
	_, err := auth.ValidateWriteToken("", tokens)
	if !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateWriteToken_MultipleTokens_CorrectOneMatched(t *testing.T) {
	tokens := []config.WriteToken{
		{Name: "cli", TokenHash: hashToken(t, "cli-token")},
		{Name: "ios-app", TokenHash: hashToken(t, "ios-token")},
		{Name: "import-service", TokenHash: hashToken(t, "import-token")},
	}

	name, err := auth.ValidateWriteToken("ios-token", tokens)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if name != "ios-app" {
		t.Errorf("name: got %q, want %q", name, "ios-app")
	}
}
