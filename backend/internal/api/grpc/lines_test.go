package grpc_test

import (
	"fmt"
	"net"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"context"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	grpcapi "github.com/rmrobinson/meridian/backend/internal/api/grpc"
	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/sharing"
	"go.uber.org/zap"
)

func newTestEnvWithFamilies(t *testing.T, families []config.LineFamily) pb.TimelineServiceClient {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte(testRawToken), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hashing token: %v", err)
	}

	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}

	cfg := &config.Config{
		Server: config.Server{GRPCPort: 9090},
		Auth: config.Auth{
			JWTSecret: testJWTSecret,
			WriteTokens: []config.WriteToken{
				{Name: "test", TokenHash: string(hash)},
			},
		},
		LineFamilies: families,
	}

	sharingStore := sharing.NewStore(database)
	gs := grpcapi.NewGRPCServer(cfg, database, zap.NewNop(), nil, nil, sharingStore)

	lis := bufconn.Listen(1024 * 1024)
	go gs.Serve(lis)

	conn, err := grpc.NewClient("passthrough://bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("dialing bufconn: %v", err)
	}

	t.Cleanup(func() {
		conn.Close()
		gs.Stop()
		database.Close()
	})

	return pb.NewTimelineServiceClient(conn)
}

func TestListLineFamilies(t *testing.T) {
	families := []config.LineFamily{
		{
			ID:            "spine",
			Label:         "Life",
			BaseColorHSL:  []int{210, 100, 50},
			Side:          "center",
			OnEnd:         "never",
			SpawnBehavior: "single_line",
		},
		{
			ID:             "employment",
			Label:          "Work",
			BaseColorHSL:   []int{120, 60, 40},
			Side:           "right",
			OnEnd:          "terminate",
			SpawnBehavior:  "per_event",
			ParentFamilyID: "spine",
		},
	}

	client := newTestEnvWithFamilies(t, families)
	ctx := authCtx(t)

	resp, err := client.ListLineFamilies(ctx, &pb.ListLineFamiliesRequest{})
	if err != nil {
		t.Fatalf("ListLineFamilies: %v", err)
	}
	if len(resp.Families) != 2 {
		t.Fatalf("expected 2 families, got %d", len(resp.Families))
	}

	spine := resp.Families[0]
	if spine.Id != "spine" {
		t.Errorf("expected id=spine, got %q", spine.Id)
	}
	if spine.Side != pb.LineFamilySide_LINE_FAMILY_SIDE_CENTER {
		t.Errorf("expected side=center, got %v", spine.Side)
	}
	if spine.OnEnd != pb.LineFamilyOnEnd_LINE_FAMILY_ON_END_NEVER {
		t.Errorf("expected on_end=never, got %v", spine.OnEnd)
	}
	if spine.SpawnBehavior != pb.LineFamilySpawnBehavior_LINE_FAMILY_SPAWN_BEHAVIOR_SINGLE_LINE {
		t.Errorf("expected spawn_behavior=single_line, got %v", spine.SpawnBehavior)
	}
	if len(spine.BaseColorHsl) != 3 || spine.BaseColorHsl[0] != 210 {
		t.Errorf("unexpected base_color_hsl: %v", spine.BaseColorHsl)
	}

	emp := resp.Families[1]
	if emp.Id != "employment" {
		t.Errorf("expected id=employment, got %q", emp.Id)
	}
	if emp.Side != pb.LineFamilySide_LINE_FAMILY_SIDE_RIGHT {
		t.Errorf("expected side=right, got %v", emp.Side)
	}
	if emp.OnEnd != pb.LineFamilyOnEnd_LINE_FAMILY_ON_END_TERMINATE {
		t.Errorf("expected on_end=terminate, got %v", emp.OnEnd)
	}
	if emp.SpawnBehavior != pb.LineFamilySpawnBehavior_LINE_FAMILY_SPAWN_BEHAVIOR_PER_EVENT {
		t.Errorf("expected spawn_behavior=per_event, got %v", emp.SpawnBehavior)
	}
	if emp.ParentFamilyId != "spine" {
		t.Errorf("expected parent_family_id=spine, got %q", emp.ParentFamilyId)
	}
}
