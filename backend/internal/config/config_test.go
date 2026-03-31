package config_test

import (
	"strings"
	"testing"

	"github.com/rmrobinson/meridian/backend/internal/config"
)

func TestLoad_ValidConfig(t *testing.T) {
	cfg, err := config.Load("testdata/valid.yaml")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if cfg.Server.RESTPort != 8080 {
		t.Errorf("rest_port: got %d, want 8080", cfg.Server.RESTPort)
	}
	if cfg.Server.GRPCPort != 9090 {
		t.Errorf("grpc_port: got %d, want 9090", cfg.Server.GRPCPort)
	}
	if cfg.Auth.JWTSecret != "test-secret" {
		t.Errorf("jwt_secret: got %q, want %q", cfg.Auth.JWTSecret, "test-secret")
	}
	if cfg.Person.BirthDate != "1990-04-12" {
		t.Errorf("birth_date: got %q, want %q", cfg.Person.BirthDate, "1990-04-12")
	}
}

func TestLoad_AllNineLineFamilies(t *testing.T) {
	cfg, err := config.Load("testdata/valid.yaml")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cfg.LineFamilies) != 9 {
		t.Fatalf("line_families: got %d, want 9", len(cfg.LineFamilies))
	}

	expected := []struct {
		id            string
		side          string
		onEnd         string
		spawnBehavior string
		hsl           [3]int
	}{
		{"spine", "center", "never", "single_line", [3]int{0, 0, 80}},
		{"employment", "left", "merge", "per_event", [3]int{210, 70, 50}},
		{"education", "left", "merge", "per_event", [3]int{270, 60, 55}},
		{"hobbies", "left", "terminate", "per_event", [3]int{180, 55, 45}},
		{"travel", "right", "merge", "per_event", [3]int{50, 85, 50}},
		{"flights", "right", "terminate", "per_event", [3]int{200, 75, 50}},
		{"books", "right", "terminate", "per_event", [3]int{30, 70, 50}},
		{"film_tv", "right", "terminate", "per_event", [3]int{300, 60, 55}},
		{"fitness", "right", "terminate", "single_line", [3]int{140, 65, 45}},
	}

	for i, want := range expected {
		got := cfg.LineFamilies[i]
		if got.ID != want.id {
			t.Errorf("[%d] id: got %q, want %q", i, got.ID, want.id)
		}
		if got.Side != want.side {
			t.Errorf("[%d] side: got %q, want %q", i, got.Side, want.side)
		}
		if got.OnEnd != want.onEnd {
			t.Errorf("[%d] on_end: got %q, want %q", i, got.OnEnd, want.onEnd)
		}
		if got.SpawnBehavior != want.spawnBehavior {
			t.Errorf("[%d] spawn_behavior: got %q, want %q", i, got.SpawnBehavior, want.spawnBehavior)
		}
		if len(got.BaseColorHSL) != 3 ||
			got.BaseColorHSL[0] != want.hsl[0] ||
			got.BaseColorHSL[1] != want.hsl[1] ||
			got.BaseColorHSL[2] != want.hsl[2] {
			t.Errorf("[%d] base_color_hsl: got %v, want %v", i, got.BaseColorHSL, want.hsl)
		}
	}
}

func TestLoad_SourcePriorityOrder(t *testing.T) {
	cfg, err := config.Load("testdata/valid.yaml")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{"manual", "garmin", "alltrails", "strava", "google_fit"}
	if len(cfg.SourcePriority.Sources) != len(want) {
		t.Fatalf("sources: got %d, want %d", len(cfg.SourcePriority.Sources), len(want))
	}
	for i, s := range want {
		if cfg.SourcePriority.Sources[i] != s {
			t.Errorf("sources[%d]: got %q, want %q", i, cfg.SourcePriority.Sources[i], s)
		}
	}
}

func TestLoad_MultipleWriteTokensParsed(t *testing.T) {
	cfg, err := config.Load("testdata/valid.yaml")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cfg.Auth.WriteTokens) != 2 {
		t.Fatalf("write_tokens: got %d, want 2", len(cfg.Auth.WriteTokens))
	}
	if cfg.Auth.WriteTokens[0].Name != "cli" {
		t.Errorf("write_tokens[0].name: got %q, want %q", cfg.Auth.WriteTokens[0].Name, "cli")
	}
	if cfg.Auth.WriteTokens[1].Name != "ios-app" {
		t.Errorf("write_tokens[1].name: got %q, want %q", cfg.Auth.WriteTokens[1].Name, "ios-app")
	}
	// Hashes must be present
	for i, tok := range cfg.Auth.WriteTokens {
		if tok.TokenHash == "" {
			t.Errorf("write_tokens[%d].token_hash is empty", i)
		}
	}
}

func TestLoad_MissingJWTSecret(t *testing.T) {
	_, err := config.Load("testdata/missing_jwt_secret.yaml")
	if err == nil {
		t.Fatal("expected error for missing jwt_secret, got nil")
	}
	if !strings.Contains(err.Error(), "jwt_secret") {
		t.Errorf("error should mention jwt_secret, got: %v", err)
	}
}

func TestLoad_MissingBirthDate(t *testing.T) {
	_, err := config.Load("testdata/missing_birth_date.yaml")
	if err == nil {
		t.Fatal("expected error for missing birth_date, got nil")
	}
	if !strings.Contains(err.Error(), "birth_date") {
		t.Errorf("error should mention birth_date, got: %v", err)
	}
}

func TestLoad_EmptyWriteTokens(t *testing.T) {
	_, err := config.Load("testdata/empty_write_tokens.yaml")
	if err == nil {
		t.Fatal("expected error for empty write_tokens, got nil")
	}
	if !strings.Contains(err.Error(), "write_tokens") {
		t.Errorf("error should mention write_tokens, got: %v", err)
	}
}

func TestLoad_MalformedYAML(t *testing.T) {
	_, err := config.Load("testdata/malformed.yaml")
	if err == nil {
		t.Fatal("expected error for malformed YAML, got nil")
	}
}
