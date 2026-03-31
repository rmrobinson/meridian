package rest_test

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/rmrobinson/meridian/backend/internal/api/rest"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

const testSecret = "test-jwt-secret"

func makeToken(role string, expiry time.Time) string {
	claims := jwt.MapClaims{
		"role": role,
		"exp":  expiry.Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString([]byte(testSecret))
	return signed
}

func TestValidateToken_ValidOwner(t *testing.T) {
	token := makeToken("owner", time.Now().Add(time.Hour))
	claims, err := rest.ValidateToken(token, testSecret)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if claims.Role != "owner" {
		t.Errorf("role: got %q, want %q", claims.Role, "owner")
	}
}

func TestValidateToken_ValidFriends(t *testing.T) {
	token := makeToken("friends", time.Now().Add(time.Hour))
	claims, err := rest.ValidateToken(token, testSecret)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if claims.Role != "friends" {
		t.Errorf("role: got %q, want %q", claims.Role, "friends")
	}
}

func TestValidateToken_Expired(t *testing.T) {
	token := makeToken("owner", time.Now().Add(-time.Hour))
	_, err := rest.ValidateToken(token, testSecret)
	if err == nil {
		t.Error("expected error for expired token, got nil")
	}
}

func TestValidateToken_Tampered(t *testing.T) {
	token := makeToken("owner", time.Now().Add(time.Hour))
	tampered := token[:len(token)-4] + "xxxx"
	_, err := rest.ValidateToken(tampered, testSecret)
	if err == nil {
		t.Error("expected error for tampered token, got nil")
	}
}

func TestRoleToVisibility_Owner(t *testing.T) {
	got := rest.RoleToVisibility("owner")
	want := []domain.Visibility{
		domain.VisibilityPublic,
		domain.VisibilityFriends,
		domain.VisibilityFamily,
		domain.VisibilityPersonal,
	}
	assertVisibilities(t, got, want)
}

func TestRoleToVisibility_Family(t *testing.T) {
	got := rest.RoleToVisibility("family")
	want := []domain.Visibility{
		domain.VisibilityPublic,
		domain.VisibilityFriends,
		domain.VisibilityFamily,
	}
	assertVisibilities(t, got, want)
}

func TestRoleToVisibility_Friends(t *testing.T) {
	got := rest.RoleToVisibility("friends")
	want := []domain.Visibility{
		domain.VisibilityPublic,
		domain.VisibilityFriends,
	}
	assertVisibilities(t, got, want)
}

func TestRoleToVisibility_Unauthenticated(t *testing.T) {
	got := rest.RoleToVisibility("")
	want := []domain.Visibility{domain.VisibilityPublic}
	assertVisibilities(t, got, want)
}

func assertVisibilities(t *testing.T, got, want []domain.Visibility) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("len: got %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("[%d]: got %q, want %q", i, got[i], want[i])
		}
	}
}
