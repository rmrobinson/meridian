package sharing_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
	"github.com/rmrobinson/meridian/backend/internal/sharing"
)

const testSecret = "test-sharing-secret"

// openTestDB opens an in-memory SQLite DB unique to the calling test.
func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func newToken(id string, vis domain.Visibility) *sharing.SharingToken {
	return &sharing.SharingToken{
		ID:         id,
		Name:       "Alice",
		Email:      "alice@example.com",
		Visibility: vis,
		CreatedAt:  time.Now().UTC().Truncate(time.Second),
	}
}

// --- Store tests ---

func TestStore_CreateAndGetByID(t *testing.T) {
	store := sharing.NewStore(openTestDB(t))
	ctx := context.Background()

	tok := newToken("tok-001", domain.VisibilityFriends)
	if err := store.Create(ctx, tok); err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := store.GetByID(ctx, tok.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got == nil {
		t.Fatal("GetByID: got nil, want token")
	}
	if got.ID != tok.ID {
		t.Errorf("ID: got %q, want %q", got.ID, tok.ID)
	}
	if got.Name != tok.Name {
		t.Errorf("Name: got %q, want %q", got.Name, tok.Name)
	}
	if got.Email != tok.Email {
		t.Errorf("Email: got %q, want %q", got.Email, tok.Email)
	}
	if got.Visibility != tok.Visibility {
		t.Errorf("Visibility: got %q, want %q", got.Visibility, tok.Visibility)
	}
	if got.DeletedAt != nil {
		t.Errorf("DeletedAt: expected nil, got %v", got.DeletedAt)
	}
}

func TestStore_CreateWithExpiry(t *testing.T) {
	store := sharing.NewStore(openTestDB(t))
	ctx := context.Background()

	expiry := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	tok := newToken("tok-expiry", domain.VisibilityFamily)
	tok.ExpiresAt = &expiry

	if err := store.Create(ctx, tok); err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := store.GetByID(ctx, tok.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.ExpiresAt == nil {
		t.Fatal("ExpiresAt: expected non-nil")
	}
	if !got.ExpiresAt.Equal(expiry) {
		t.Errorf("ExpiresAt: got %v, want %v", got.ExpiresAt, expiry)
	}
}

func TestStore_GetByID_NotFound(t *testing.T) {
	store := sharing.NewStore(openTestDB(t))
	ctx := context.Background()

	got, err := store.GetByID(ctx, "does-not-exist")
	if err != nil {
		t.Fatalf("GetByID: unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("GetByID: expected nil for unknown ID, got %+v", got)
	}
}

func TestStore_Revoke(t *testing.T) {
	store := sharing.NewStore(openTestDB(t))
	ctx := context.Background()

	tok := newToken("tok-revoke", domain.VisibilityPublic)
	if err := store.Create(ctx, tok); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := store.Revoke(ctx, tok.ID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	got, err := store.GetByID(ctx, tok.ID)
	if err != nil {
		t.Fatalf("GetByID after revoke: %v", err)
	}
	if got == nil {
		t.Fatal("GetByID: expected row to still exist after revoke")
	}
	if got.DeletedAt == nil {
		t.Error("DeletedAt: expected non-nil after revoke")
	}
}

func TestStore_List_Empty(t *testing.T) {
	store := sharing.NewStore(openTestDB(t))
	ctx := context.Background()

	tokens, err := store.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(tokens) != 0 {
		t.Errorf("List: got %d tokens, want 0", len(tokens))
	}
}

func TestStore_List_IncludesRevoked(t *testing.T) {
	store := sharing.NewStore(openTestDB(t))
	ctx := context.Background()

	tok1 := newToken("tok-list-1", domain.VisibilityFriends)
	tok2 := newToken("tok-list-2", domain.VisibilityFamily)

	if err := store.Create(ctx, tok1); err != nil {
		t.Fatalf("Create tok1: %v", err)
	}
	if err := store.Create(ctx, tok2); err != nil {
		t.Fatalf("Create tok2: %v", err)
	}
	if err := store.Revoke(ctx, tok2.ID); err != nil {
		t.Fatalf("Revoke tok2: %v", err)
	}

	tokens, err := store.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(tokens) != 2 {
		t.Fatalf("List: got %d tokens, want 2", len(tokens))
	}

	byID := make(map[string]*sharing.SharingToken, len(tokens))
	for _, tok := range tokens {
		byID[tok.ID] = tok
	}

	if byID[tok1.ID].DeletedAt != nil {
		t.Error("tok1: expected DeletedAt nil")
	}
	if byID[tok2.ID].DeletedAt == nil {
		t.Error("tok2: expected DeletedAt non-nil after revoke")
	}
}

// --- JWT token tests ---

func makeTestToken(id string, vis domain.Visibility, expiresAt *time.Time) *sharing.SharingToken {
	return &sharing.SharingToken{
		ID:         id,
		Name:       "Bob",
		Email:      "bob@example.com",
		Visibility: vis,
		CreatedAt:  time.Now().UTC(),
		ExpiresAt:  expiresAt,
	}
}

func TestIssue_RoundTrip(t *testing.T) {
	tok := makeTestToken("jwt-001", domain.VisibilityFriends, nil)
	signed, err := sharing.Issue(tok, []byte(testSecret))
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if signed == "" {
		t.Fatal("Issue: returned empty string")
	}

	claims, err := sharing.Validate(signed, []byte(testSecret))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if claims.ID != tok.ID {
		t.Errorf("jti: got %q, want %q", claims.ID, tok.ID)
	}
	if claims.Name != tok.Name {
		t.Errorf("name: got %q, want %q", claims.Name, tok.Name)
	}
	if claims.Email != tok.Email {
		t.Errorf("email: got %q, want %q", claims.Email, tok.Email)
	}
	// VISIBILITY_FRIENDS = 2
	if claims.Visibility != 2 {
		t.Errorf("visibility: got %d, want 2", claims.Visibility)
	}
}

func TestIssue_WithExpiry(t *testing.T) {
	expiry := time.Now().Add(time.Hour)
	tok := makeTestToken("jwt-expiry", domain.VisibilityFamily, &expiry)

	signed, err := sharing.Issue(tok, []byte(testSecret))
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	claims, err := sharing.Validate(signed, []byte(testSecret))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if claims.ExpiresAt == nil {
		t.Fatal("ExpiresAt: expected non-nil in claims")
	}
}

func TestIssue_NoExpiry(t *testing.T) {
	tok := makeTestToken("jwt-noexp", domain.VisibilityPublic, nil)

	signed, err := sharing.Issue(tok, []byte(testSecret))
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	claims, err := sharing.Validate(signed, []byte(testSecret))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if claims.ExpiresAt != nil {
		t.Errorf("ExpiresAt: expected nil, got %v", claims.ExpiresAt)
	}
}

func TestValidate_WrongSecret(t *testing.T) {
	tok := makeTestToken("jwt-wrong", domain.VisibilityPublic, nil)
	signed, err := sharing.Issue(tok, []byte(testSecret))
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	_, err = sharing.Validate(signed, []byte("wrong-secret"))
	if err == nil {
		t.Error("Validate: expected error for wrong secret, got nil")
	}
}

func TestValidate_Tampered(t *testing.T) {
	tok := makeTestToken("jwt-tamper", domain.VisibilityPublic, nil)
	signed, err := sharing.Issue(tok, []byte(testSecret))
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	tampered := signed[:len(signed)-4] + "xxxx"
	_, err = sharing.Validate(tampered, []byte(testSecret))
	if err == nil {
		t.Error("Validate: expected error for tampered token, got nil")
	}
}

func TestValidate_Expired_StillReturnsClaimsForDBCheck(t *testing.T) {
	// Sharing token Validate intentionally skips exp validation so the caller
	// can still extract the jti and do the DB check (DB is authoritative).
	past := time.Now().Add(-time.Hour)
	tok := makeTestToken("jwt-past", domain.VisibilityPublic, &past)

	signed, err := sharing.Issue(tok, []byte(testSecret))
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	claims, err := sharing.Validate(signed, []byte(testSecret))
	if err != nil {
		t.Fatalf("Validate: expected no error (exp validation skipped), got %v", err)
	}
	if claims.ID != tok.ID {
		t.Errorf("jti: got %q, want %q", claims.ID, tok.ID)
	}
}
