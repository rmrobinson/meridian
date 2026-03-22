import { describe, it, expect } from 'vitest';
// import { assignLanes } from '../../js/lanes.js';

// TODO: implement in Phase 2 alongside the lane algorithm.
// Test cases are spec'd below so the expected behaviour is documented
// before the implementation begins.

describe.todo('assignLanes() — Phase 2');
// - Single span assigned to correct preferred side
// - Concurrent spans from different families assigned to correct sides
// - Concurrent spans from the same family assigned to adjacent sibling lanes
// - Lane freed correctly when a span ends
// - Overflow to opposite side when preferred side is full
// - Sibling count tracked correctly as concurrent spans start and end
// - Nested branch assigned outward from parent line X, not from spine X
// - Nested branch merge-back returns to parent X, not spine X
// - Nested branch during an inactive parent is flagged as a data error
