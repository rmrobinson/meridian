package domain

type Side string

const (
	SideLeft   Side = "left"
	SideRight  Side = "right"
	SideCenter Side = "center"
)

type OnEnd string

const (
	OnEndMerge     OnEnd = "merge"
	OnEndTerminate OnEnd = "terminate"
	OnEndNever     OnEnd = "never"
)

type SpawnBehavior string

const (
	SpawnBehaviorPerEvent       SpawnBehavior = "per_event"
	SpawnBehaviorSingleLine     SpawnBehavior = "single_line"
	SpawnBehaviorSecondarySpine SpawnBehavior = "secondary_spine"
)

type LineFamily struct {
	ID            string
	Label         string
	BaseColorHSL  [3]int
	Side          Side
	OnEnd         OnEnd
	SpawnBehavior SpawnBehavior
}
