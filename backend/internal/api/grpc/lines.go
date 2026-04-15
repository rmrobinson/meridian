package grpc

import (
	"context"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
)

func (s *Server) ListLineFamilies(_ context.Context, _ *pb.ListLineFamiliesRequest) (*pb.ListLineFamiliesResponse, error) {
	families := make([]*pb.LineFamilyConfig, 0, len(s.cfg.LineFamilies))
	for _, f := range s.cfg.LineFamilies {
		side, err := lineFamilySideToProto(f.Side)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "invalid side %q for family %q", f.Side, f.ID)
		}
		onEnd, err := lineFamilyOnEndToProto(f.OnEnd)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "invalid on_end %q for family %q", f.OnEnd, f.ID)
		}
		spawn, err := lineFamilySpawnBehaviorToProto(f.SpawnBehavior)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "invalid spawn_behavior %q for family %q", f.SpawnBehavior, f.ID)
		}

		pbf := &pb.LineFamilyConfig{
			Id:             f.ID,
			Label:          f.Label,
			Side:           side,
			OnEnd:          onEnd,
			SpawnBehavior:  spawn,
			ParentFamilyId: f.ParentFamilyID,
		}
		for _, v := range f.BaseColorHSL {
			pbf.BaseColorHsl = append(pbf.BaseColorHsl, int32(v))
		}
		families = append(families, pbf)
	}
	return &pb.ListLineFamiliesResponse{Families: families}, nil
}

func lineFamilySideToProto(s string) (pb.LineFamilySide, error) {
	switch s {
	case "left":
		return pb.LineFamilySide_LINE_FAMILY_SIDE_LEFT, nil
	case "right":
		return pb.LineFamilySide_LINE_FAMILY_SIDE_RIGHT, nil
	case "center":
		return pb.LineFamilySide_LINE_FAMILY_SIDE_CENTER, nil
	default:
		return pb.LineFamilySide_LINE_FAMILY_SIDE_UNSPECIFIED, fmt.Errorf("unknown side: %q", s)
	}
}

func lineFamilyOnEndToProto(s string) (pb.LineFamilyOnEnd, error) {
	switch s {
	case "merge":
		return pb.LineFamilyOnEnd_LINE_FAMILY_ON_END_MERGE, nil
	case "terminate":
		return pb.LineFamilyOnEnd_LINE_FAMILY_ON_END_TERMINATE, nil
	case "never":
		return pb.LineFamilyOnEnd_LINE_FAMILY_ON_END_NEVER, nil
	default:
		return pb.LineFamilyOnEnd_LINE_FAMILY_ON_END_UNSPECIFIED, fmt.Errorf("unknown on_end: %q", s)
	}
}

func lineFamilySpawnBehaviorToProto(s string) (pb.LineFamilySpawnBehavior, error) {
	switch s {
	case "per_event":
		return pb.LineFamilySpawnBehavior_LINE_FAMILY_SPAWN_BEHAVIOR_PER_EVENT, nil
	case "single_line":
		return pb.LineFamilySpawnBehavior_LINE_FAMILY_SPAWN_BEHAVIOR_SINGLE_LINE, nil
	case "secondary_spine":
		return pb.LineFamilySpawnBehavior_LINE_FAMILY_SPAWN_BEHAVIOR_SECONDARY_SPINE, nil
	default:
		return pb.LineFamilySpawnBehavior_LINE_FAMILY_SPAWN_BEHAVIOR_UNSPECIFIED, fmt.Errorf("unknown spawn_behavior: %q", s)
	}
}
