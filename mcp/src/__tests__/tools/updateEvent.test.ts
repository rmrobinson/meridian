import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientError, Status } from "nice-grpc-common";
import { ActivityType, EventType, Visibility } from "../../../proto-gen/meridian/v1/timeline.js";

vi.mock("../../client.js", () => ({
  client: { updateEvent: vi.fn() },
}));

import { client } from "../../client.js";
import { updateEvent } from "../../tools/updateEvent.js";

const mockUpdateEvent = vi.mocked(client.updateEvent);

const baseResponseEvent = {
  id: "evt-1",
  familyId: "spine",
  lineKey: "",
  parentLineKey: "",
  type: EventType.EVENT_TYPE_POINT,
  title: "Updated",
  label: "",
  icon: "",
  date: "",
  startDate: "",
  endDate: "",
  location: undefined,
  externalUrl: "",
  heroImageUrl: "",
  metadata: "",
  visibility: Visibility.VISIBILITY_PERSONAL,
  sourceService: "",
  sourceEventId: "",
  canonicalId: "",
  photos: [],
  activityType: ActivityType.ACTIVITY_TYPE_UNSPECIFIED,
  description: "",
  endIcon: "",
};

describe("updateEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEvent.mockResolvedValue({ event: { ...baseResponseEvent } });
  });

  it("sends zero-values for all omitted optional fields", async () => {
    await updateEvent({ id: "evt-1" });
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt-1",
        title: "",
        date: "",
        startDate: "",
        endDate: "",
        description: "",
        activityType: ActivityType.ACTIVITY_TYPE_UNSPECIFIED,
        visibility: Visibility.VISIBILITY_UNSPECIFIED,
        lineKey: "",
        parentLineKey: "",
        externalUrl: "",
        metadata: "",
        label: "",
        icon: "",
      })
    );
  });

  it("always sends type as EVENT_TYPE_UNSPECIFIED and familyId as empty string", async () => {
    await updateEvent({ id: "evt-1", title: "New Title" });
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EventType.EVENT_TYPE_UNSPECIFIED,
        familyId: "",
      })
    );
  });

  it("includes location object when location fields are provided", async () => {
    await updateEvent({ id: "evt-1", location_label: "Office", location_lat: 10, location_lng: 20 });
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ location: { label: "Office", lat: 10, lng: 20 } })
    );
  });

  it("sends location as undefined when no location fields are provided", async () => {
    await updateEvent({ id: "evt-1" });
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ location: undefined })
    );
  });

  it("returns the updated event id and title", async () => {
    mockUpdateEvent.mockResolvedValue({ event: { ...baseResponseEvent, id: "evt-1", title: "Renamed" } });
    const result = await updateEvent({ id: "evt-1", title: "Renamed" });
    expect(result).toBe("Updated event: [evt-1] Renamed");
  });

  it("returns a fallback message when response has no event", async () => {
    mockUpdateEvent.mockResolvedValue({ event: undefined });
    const result = await updateEvent({ id: "evt-1" });
    expect(result).toContain("no event data returned");
  });

  it("returns mapped error string on gRPC error", async () => {
    mockUpdateEvent.mockRejectedValue(
      new ClientError("/foo/UpdateEvent", Status.NOT_FOUND, "event not found")
    );
    const result = await updateEvent({ id: "missing" });
    expect(result).toBe("Not found: event not found");
  });
});
