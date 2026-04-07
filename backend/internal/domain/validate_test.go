package domain

import (
	"encoding/json"
	"testing"
)

func metaPtr(v any) *string {
	b, _ := json.Marshal(v)
	s := string(b)
	return &s
}

func TestValidateMetadata_Flight_Valid(t *testing.T) {
	e := &Event{FamilyID: "flights", Metadata: metaPtr(FlightMetadata{Airline: "Air Canada", FlightNumber: "AC123"})}
	if err := ValidateMetadata("flight", e); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestValidateMetadata_Flight_MissingAirline(t *testing.T) {
	e := &Event{FamilyID: "flights", Metadata: metaPtr(FlightMetadata{FlightNumber: "AC123"})}
	if err := ValidateMetadata("flight", e); err == nil {
		t.Error("expected error for missing airline, got nil")
	}
}

func TestValidateMetadata_Climbing_ValidSportWithRoute(t *testing.T) {
	e := &Event{
		FamilyID: "fitness",
		Metadata: metaPtr(FitnessMetadata{Activity: "climb", ClimbingType: "sport", RouteName: "The Nose"}),
	}
	if err := ValidateMetadata("fitness", e); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestValidateMetadata_Climbing_SportMissingRouteName(t *testing.T) {
	e := &Event{
		FamilyID: "fitness",
		Metadata: metaPtr(FitnessMetadata{Activity: "climb", ClimbingType: "sport"}),
	}
	if err := ValidateMetadata("fitness", e); err == nil {
		t.Error("expected error for sport climbing missing route_name, got nil")
	}
}

func TestValidateMetadata_Climbing_ValidBoulderingWithProblemName(t *testing.T) {
	e := &Event{
		FamilyID: "fitness",
		Metadata: metaPtr(FitnessMetadata{Activity: "climb", ClimbingType: "bouldering", ProblemName: "La Marie Rose"}),
	}
	if err := ValidateMetadata("fitness", e); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestValidateMetadata_Climbing_BoulderingMissingProblemName(t *testing.T) {
	e := &Event{
		FamilyID: "fitness",
		Metadata: metaPtr(FitnessMetadata{Activity: "climb", ClimbingType: "bouldering"}),
	}
	if err := ValidateMetadata("fitness", e); err == nil {
		t.Error("expected error for bouldering missing problem_name, got nil")
	}
}

func TestValidateMetadata_Climbing_ValidGym(t *testing.T) {
	e := &Event{
		FamilyID: "fitness",
		Metadata: metaPtr(FitnessMetadata{Activity: "climb", ClimbingType: "gym"}),
	}
	if err := ValidateMetadata("fitness", e); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestValidateMetadata_Climbing_UnknownClimbingType(t *testing.T) {
	e := &Event{
		FamilyID: "fitness",
		Metadata: metaPtr(FitnessMetadata{Activity: "climb", ClimbingType: "trad"}),
	}
	if err := ValidateMetadata("fitness", e); err == nil {
		t.Error("expected error for unknown climbing_type, got nil")
	}
}

func TestValidateMetadata_Fitness_ValidActivities(t *testing.T) {
	activities := []string{"run", "cycle", "hike", "ski", "scuba", "golf", "squash"}
	for _, act := range activities {
		e := &Event{FamilyID: "fitness", Metadata: metaPtr(FitnessMetadata{Activity: act})}
		if err := ValidateMetadata("fitness", e); err != nil {
			t.Errorf("activity %q: expected no error, got %v", act, err)
		}
	}
}

func TestValidateMetadata_Fitness_UnknownActivity(t *testing.T) {
	e := &Event{FamilyID: "fitness", Metadata: metaPtr(FitnessMetadata{Activity: "surfing"})}
	if err := ValidateMetadata("fitness", e); err == nil {
		t.Error("expected error for unknown activity, got nil")
	}
}

func TestValidateMetadata_Spine_UnknownMilestoneType(t *testing.T) {
	e := &Event{FamilyID: "spine", Metadata: metaPtr(LifeMetadata{MilestoneType: "cosmic-event"})}
	if err := ValidateMetadata("life", e); err == nil {
		t.Error("expected error for unknown milestone_type, got nil")
	}
}
