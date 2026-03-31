package domain

import (
	"errors"
	"fmt"
)

var validClimbingTypes = map[string]bool{
	"sport": true, "bouldering": true, "gym": true,
}

var validSpineMilestoneTypes = map[string]bool{
	"birth": true, "death": true, "marriage": true, "relocation": true,
	"graduation": true, "anniversary": true,
}

var validFitnessActivities = map[string]bool{
	"run": true, "cycle": true, "hike": true, "ski": true,
	"scuba": true, "climb": true, "golf": true, "squash": true,
}

// ValidateMetadata checks that metadata for the given family contains the
// required fields. It returns nil for families with no required fields or for
// events with empty metadata where no fields are required.
func ValidateMetadata(familyID string, event *Event) error {
	switch familyID {
	case "books":
		return validateBooksMetadata(event)
	case "film_tv":
		return validateFilmTVMetadata(event)
	case "flights":
		return validateFlightsMetadata(event)
	case "fitness":
		return validateFitnessMetadata(event)
	case "spine":
		return validateSpineMetadata(event)
	default:
		return nil
	}
}

func validateBooksMetadata(event *Event) error {
	if event.Metadata == nil || *event.Metadata == "" {
		return errors.New("books metadata: isbn is required")
	}
	m, err := ParseMetadata[BookMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing book metadata: %w", err)
	}
	if m.ISBN == "" {
		return errors.New("books metadata: isbn is required")
	}
	return nil
}

func validateFilmTVMetadata(event *Event) error {
	m, err := ParseMetadata[FilmTVMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing film_tv metadata: %w", err)
	}
	var errs []error
	if m.TMDBID == "" {
		errs = append(errs, errors.New("film_tv metadata: tmdb_id is required"))
	}
	if m.Type != "movie" && m.Type != "tv" {
		errs = append(errs, fmt.Errorf("film_tv metadata: type must be %q or %q, got %q", "movie", "tv", m.Type))
	}
	return errors.Join(errs...)
}

func validateFlightsMetadata(event *Event) error {
	m, err := ParseMetadata[FlightMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing flights metadata: %w", err)
	}
	var errs []error
	if m.Airline == "" {
		errs = append(errs, errors.New("flights metadata: airline is required"))
	}
	if m.FlightNumber == "" {
		errs = append(errs, errors.New("flights metadata: flight_number is required"))
	}
	return errors.Join(errs...)
}

func validateFitnessMetadata(event *Event) error {
	// Fitness metadata is optional; skip validation when absent.
	if event.Metadata == nil || *event.Metadata == "" {
		return nil
	}
	m, err := ParseMetadata[FitnessMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing fitness metadata: %w", err)
	}
	if m.Activity == "" {
		return nil // no activity in metadata is fine; activity_type column is used
	}
	if !validFitnessActivities[m.Activity] {
		return fmt.Errorf("fitness metadata: unknown activity %q", m.Activity)
	}
	if m.Activity == "climb" {
		if m.ClimbingType == "" {
			return errors.New("fitness metadata: climbing_type is required for climb activity")
		}
		if !validClimbingTypes[m.ClimbingType] {
			return fmt.Errorf("fitness metadata: unknown climbing_type %q", m.ClimbingType)
		}
		if m.ClimbingType == "sport" && m.RouteName == "" {
			return errors.New("fitness metadata: route_name is required for sport climbing")
		}
		if m.ClimbingType == "bouldering" && m.ProblemName == "" {
			return errors.New("fitness metadata: problem_name is required for bouldering")
		}
	}
	return nil
}

func validateSpineMetadata(event *Event) error {
	m, err := ParseMetadata[SpineMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing spine metadata: %w", err)
	}
	if m.MilestoneType == "" {
		return errors.New("spine metadata: milestone_type is required")
	}
	if !validSpineMilestoneTypes[m.MilestoneType] {
		return fmt.Errorf("spine metadata: unknown milestone_type %q", m.MilestoneType)
	}
	return nil
}
