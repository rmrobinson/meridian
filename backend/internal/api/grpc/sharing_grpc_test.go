package grpc_test

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
)

func TestCreateSharingToken_Success(t *testing.T) {
	env := newTestEnv(t)

	resp, err := env.sharingClient.CreateSharingToken(authCtx(t), &pb.CreateSharingTokenRequest{
		Name:       "Alice",
		Email:      "alice@example.com",
		Visibility: pb.Visibility_VISIBILITY_FRIENDS,
	})
	if err != nil {
		t.Fatalf("CreateSharingToken: %v", err)
	}
	if resp.Token == "" {
		t.Error("Token: expected non-empty JWT string")
	}
	if resp.Record == nil {
		t.Fatal("Record: expected non-nil")
	}
	if resp.Record.Id == "" {
		t.Error("Record.Id: expected non-empty")
	}
	if resp.Record.Name != "Alice" {
		t.Errorf("Record.Name: got %q, want %q", resp.Record.Name, "Alice")
	}
	if resp.Record.Email != "alice@example.com" {
		t.Errorf("Record.Email: got %q, want %q", resp.Record.Email, "alice@example.com")
	}
	if resp.Record.Visibility != pb.Visibility_VISIBILITY_FRIENDS {
		t.Errorf("Record.Visibility: got %v, want VISIBILITY_FRIENDS", resp.Record.Visibility)
	}
	if resp.Record.ExpiresAt != nil {
		t.Errorf("Record.ExpiresAt: expected nil, got %v", resp.Record.ExpiresAt)
	}
	if resp.Record.DeletedAt != nil {
		t.Errorf("Record.DeletedAt: expected nil, got %v", resp.Record.DeletedAt)
	}
}

func TestCreateSharingToken_WithExpiry(t *testing.T) {
	env := newTestEnv(t)

	expiry := timestamppb.New(time.Now().Add(time.Hour))
	resp, err := env.sharingClient.CreateSharingToken(authCtx(t), &pb.CreateSharingTokenRequest{
		Name:       "Bob",
		Email:      "bob@example.com",
		Visibility: pb.Visibility_VISIBILITY_FAMILY,
		ExpiresAt:  expiry,
	})
	if err != nil {
		t.Fatalf("CreateSharingToken: %v", err)
	}
	if resp.Record.ExpiresAt == nil {
		t.Fatal("Record.ExpiresAt: expected non-nil")
	}
	if resp.Record.ExpiresAt.AsTime().Before(time.Now()) {
		t.Error("Record.ExpiresAt: expected a future timestamp")
	}
}

func TestCreateSharingToken_MissingName(t *testing.T) {
	env := newTestEnv(t)

	_, err := env.sharingClient.CreateSharingToken(authCtx(t), &pb.CreateSharingTokenRequest{
		Email:      "alice@example.com",
		Visibility: pb.Visibility_VISIBILITY_FRIENDS,
	})
	assertCode(t, err, codes.InvalidArgument)
}

func TestCreateSharingToken_MissingEmail(t *testing.T) {
	env := newTestEnv(t)

	_, err := env.sharingClient.CreateSharingToken(authCtx(t), &pb.CreateSharingTokenRequest{
		Name:       "Alice",
		Visibility: pb.Visibility_VISIBILITY_FRIENDS,
	})
	assertCode(t, err, codes.InvalidArgument)
}

func TestCreateSharingToken_UnspecifiedVisibility(t *testing.T) {
	env := newTestEnv(t)

	_, err := env.sharingClient.CreateSharingToken(authCtx(t), &pb.CreateSharingTokenRequest{
		Name:  "Alice",
		Email: "alice@example.com",
	})
	assertCode(t, err, codes.InvalidArgument)
}

func TestRevokeSharingToken_Success(t *testing.T) {
	env := newTestEnv(t)

	create, err := env.sharingClient.CreateSharingToken(authCtx(t), &pb.CreateSharingTokenRequest{
		Name:       "Carol",
		Email:      "carol@example.com",
		Visibility: pb.Visibility_VISIBILITY_FRIENDS,
	})
	if err != nil {
		t.Fatalf("CreateSharingToken: %v", err)
	}

	_, err = env.sharingClient.RevokeSharingToken(authCtx(t), &pb.RevokeSharingTokenRequest{
		Id: create.Record.Id,
	})
	if err != nil {
		t.Fatalf("RevokeSharingToken: %v", err)
	}
}

func TestRevokeSharingToken_NoopOnUnknownID(t *testing.T) {
	env := newTestEnv(t)

	_, err := env.sharingClient.RevokeSharingToken(authCtx(t), &pb.RevokeSharingTokenRequest{
		Id: "does-not-exist",
	})
	if err != nil {
		t.Fatalf("RevokeSharingToken: expected no error for unknown ID, got %v", err)
	}
}

func TestListSharingTokens_Empty(t *testing.T) {
	env := newTestEnv(t)

	resp, err := env.sharingClient.ListSharingTokens(authCtx(t), &pb.ListSharingTokensRequest{})
	if err != nil {
		t.Fatalf("ListSharingTokens: %v", err)
	}
	if len(resp.Tokens) != 0 {
		t.Errorf("Tokens: got %d, want 0", len(resp.Tokens))
	}
}

func TestListSharingTokens_IncludesRevoked(t *testing.T) {
	env := newTestEnv(t)
	ctx := authCtx(t)

	create1, err := env.sharingClient.CreateSharingToken(ctx, &pb.CreateSharingTokenRequest{
		Name:       "Dave",
		Email:      "dave@example.com",
		Visibility: pb.Visibility_VISIBILITY_FRIENDS,
	})
	if err != nil {
		t.Fatalf("CreateSharingToken 1: %v", err)
	}

	create2, err := env.sharingClient.CreateSharingToken(ctx, &pb.CreateSharingTokenRequest{
		Name:       "Eve",
		Email:      "eve@example.com",
		Visibility: pb.Visibility_VISIBILITY_FAMILY,
	})
	if err != nil {
		t.Fatalf("CreateSharingToken 2: %v", err)
	}

	if _, err := env.sharingClient.RevokeSharingToken(ctx, &pb.RevokeSharingTokenRequest{Id: create2.Record.Id}); err != nil {
		t.Fatalf("RevokeSharingToken: %v", err)
	}

	list, err := env.sharingClient.ListSharingTokens(ctx, &pb.ListSharingTokensRequest{})
	if err != nil {
		t.Fatalf("ListSharingTokens: %v", err)
	}
	if len(list.Tokens) != 2 {
		t.Fatalf("Tokens: got %d, want 2", len(list.Tokens))
	}

	byID := make(map[string]*pb.SharingTokenRecord, len(list.Tokens))
	for _, tok := range list.Tokens {
		byID[tok.Id] = tok
	}

	if byID[create1.Record.Id].DeletedAt != nil {
		t.Error("token 1: expected DeletedAt nil")
	}
	if byID[create2.Record.Id].DeletedAt == nil {
		t.Error("token 2: expected DeletedAt non-nil after revoke")
	}
}

func TestSharingService_RequiresAuth(t *testing.T) {
	env := newTestEnv(t)

	// Call without any authorization metadata.
	_, err := env.sharingClient.CreateSharingToken(context.Background(), &pb.CreateSharingTokenRequest{
		Name:       "Alice",
		Email:      "alice@example.com",
		Visibility: pb.Visibility_VISIBILITY_FRIENDS,
	})
	assertCode(t, err, codes.Unauthenticated)
}
