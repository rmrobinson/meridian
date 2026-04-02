import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientError, Status } from "nice-grpc-common";
import { ActivityType, EventType, Visibility } from "../../../proto-gen/meridian/v1/timeline.js";

vi.mock("../../client.js", () => ({
  client: { createEvent: vi.fn() },
}));

import { client } from "../../client.js";
import { createEvent } from "../../tools/createEvent.js";

const mockCreateEvent = vi.mocked(client.createEvent);

const baseResponseEvent = {
  id: "new-id",
  familyId: "spine",
  lineKey: "",
  parentLineKey: "",
  type: EventType.EVENT_TYPE_POINT,
  title: "New Event",
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

describe("createEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEvent.mockResolvedValue({ event: { ...baseResponseEvent } });
  });

  describe("type mapping", () => {
    it('maps "span" to EVENT_TYPE_SPAN', async () => {
      await createEvent({ title: "T", family_id: "spine", type: "span" });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: EventType.EVENT_TYPE_SPAN })
      );
    });

    it('maps "point" to EVENT_TYPE_POINT', async () => {
      await createEvent({ title: "T", family_id: "spine", type: "point" });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: EventType.EVENT_TYPE_POINT })
      );
    });
  });

  describe("activity_type mapping", () => {
    it.each([
      ["run", ActivityType.ACTIVITY_TYPE_RUN],
      ["cycle", ActivityType.ACTIVITY_TYPE_CYCLE],
      ["hike", ActivityType.ACTIVITY_TYPE_HIKE],
      ["ski", ActivityType.ACTIVITY_TYPE_SKI],
      ["scuba", ActivityType.ACTIVITY_TYPE_SCUBA],
      ["climb", ActivityType.ACTIVITY_TYPE_CLIMB],
      ["golf", ActivityType.ACTIVITY_TYPE_GOLF],
      ["squash", ActivityType.ACTIVITY_TYPE_SQUASH],
      ["concert", ActivityType.ACTIVITY_TYPE_CONCERT],
      ["flight", ActivityType.ACTIVITY_TYPE_FLIGHT],
      ["book", ActivityType.ACTIVITY_TYPE_BOOK],
      ["movie", ActivityType.ACTIVITY_TYPE_MOVIE],
      ["tv", ActivityType.ACTIVITY_TYPE_TV],
    ] as const)('maps activity_type "%s" to the correct enum value', async (input, expected) => {
      await createEvent({ title: "T", family_id: "spine", type: "point", activity_type: input });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ activityType: expected })
      );
    });

    it("sends ACTIVITY_TYPE_UNSPECIFIED when activity_type is omitted", async () => {
      await createEvent({ title: "T", family_id: "spine", type: "point" });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ activityType: ActivityType.ACTIVITY_TYPE_UNSPECIFIED })
      );
    });
  });

  describe("visibility mapping", () => {
    it.each([
      ["personal", Visibility.VISIBILITY_PERSONAL],
      ["family", Visibility.VISIBILITY_FAMILY],
      ["friends", Visibility.VISIBILITY_FRIENDS],
      ["public", Visibility.VISIBILITY_PUBLIC],
    ] as const)('maps visibility "%s" to the correct enum value', async (input, expected) => {
      await createEvent({ title: "T", family_id: "spine", type: "point", visibility: input });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: expected })
      );
    });

    it("defaults to VISIBILITY_PERSONAL when visibility is omitted", async () => {
      await createEvent({ title: "T", family_id: "spine", type: "point" });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: Visibility.VISIBILITY_PERSONAL })
      );
    });
  });

  describe("location handling", () => {
    it("includes location object when all three fields are provided", async () => {
      await createEvent({
        title: "T", family_id: "spine", type: "point",
        location_label: "Home", location_lat: 1.5, location_lng: 2.5,
      });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ location: { label: "Home", lat: 1.5, lng: 2.5 } })
      );
    });

    it("includes location when only location_label is provided, with lat/lng defaulting to 0", async () => {
      await createEvent({ title: "T", family_id: "spine", type: "point", location_label: "Somewhere" });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ location: { label: "Somewhere", lat: 0, lng: 0 } })
      );
    });

    it("sends location as undefined when no location fields are provided", async () => {
      await createEvent({ title: "T", family_id: "spine", type: "point" });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ location: undefined })
      );
    });
  });

  describe("response handling", () => {
    it("returns the created event id and title", async () => {
      mockCreateEvent.mockResolvedValue({ event: { ...baseResponseEvent, id: "abc-123", title: "My Event" } });
      const result = await createEvent({ title: "My Event", family_id: "spine", type: "point" });
      expect(result).toBe("Created event: [abc-123] My Event");
    });

    it("returns a fallback message when response has no event", async () => {
      mockCreateEvent.mockResolvedValue({ event: undefined });
      const result = await createEvent({ title: "T", family_id: "spine", type: "point" });
      expect(result).toContain("no event data returned");
    });

    it("returns mapped error string on gRPC error", async () => {
      mockCreateEvent.mockRejectedValue(
        new ClientError("/foo/CreateEvent", Status.INVALID_ARGUMENT, "title is required")
      );
      const result = await createEvent({ title: "", family_id: "spine", type: "point" });
      expect(result).toBe("title is required");
    });
  });
});
