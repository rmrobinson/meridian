import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientError, Status } from "nice-grpc-common";
import { EventType, Visibility } from "../../../proto-gen/meridian/v1/timeline.js";

vi.mock("../../client.js", () => ({
  client: { listEvents: vi.fn() },
}));

import { client } from "../../client.js";
import { listEvents } from "../../tools/listEvents.js";

const mockListEvents = vi.mocked(client.listEvents);

function makeEvent(overrides: Partial<{
  id: string;
  familyId: string;
  title: string;
  type: EventType;
  date: string;
  startDate: string;
  endDate: string;
  visibility: Visibility;
  description: string;
}> = {}) {
  return {
    id: "evt-1",
    familyId: "spine",
    title: "Test Event",
    type: EventType.EVENT_TYPE_POINT,
    date: "2024-01-01",
    startDate: "",
    endDate: "",
    visibility: Visibility.VISIBILITY_PERSONAL,
    description: "",
    lineKey: "",
    parentLineKey: "",
    label: "",
    icon: "",
    location: undefined,
    externalUrl: "",
    heroImageUrl: "",
    metadata: "",
    sourceService: "",
    sourceEventId: "",
    canonicalId: "",
    photos: [],
    endIcon: "",
    ...overrides,
  };
}

describe("listEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("request mapping", () => {
    it("sends empty strings and empty array when no filters provided", async () => {
      mockListEvents.mockResolvedValue({ events: [] });
      await listEvents({});
      expect(mockListEvents).toHaveBeenCalledWith({
        familyId: "",
        from: "",
        to: "",
        visibilities: [],
      });
    });

    it("passes family_id as familyId", async () => {
      mockListEvents.mockResolvedValue({ events: [] });
      await listEvents({ family_id: "books" });
      expect(mockListEvents).toHaveBeenCalledWith(expect.objectContaining({ familyId: "books" }));
    });

    it("passes from and to through", async () => {
      mockListEvents.mockResolvedValue({ events: [] });
      await listEvents({ from: "2024-01-01", to: "2024-12-31" });
      expect(mockListEvents).toHaveBeenCalledWith(
        expect.objectContaining({ from: "2024-01-01", to: "2024-12-31" })
      );
    });

    it.each([
      ["public", Visibility.VISIBILITY_PUBLIC],
      ["friends", Visibility.VISIBILITY_FRIENDS],
      ["family", Visibility.VISIBILITY_FAMILY],
      ["personal", Visibility.VISIBILITY_PERSONAL],
    ] as const)('maps visibility "%s" to the correct enum value', async (input, expected) => {
      mockListEvents.mockResolvedValue({ events: [] });
      await listEvents({ visibilities: [input] });
      expect(mockListEvents).toHaveBeenCalledWith(
        expect.objectContaining({ visibilities: [expected] })
      );
    });
  });

  describe("response formatting", () => {
    it("returns empty message when no events found", async () => {
      mockListEvents.mockResolvedValue({ events: [] });
      const result = await listEvents({});
      expect(result).toBe("No events found matching the given filters.");
    });

    it("returns event count and formatted lines", async () => {
      mockListEvents.mockResolvedValue({ events: [makeEvent()] });
      const result = await listEvents({});
      expect(result).toContain("1 event(s)");
      expect(result).toContain("evt-1");
      expect(result).toContain("Test Event");
    });

    it("shows date for point events with a date set", async () => {
      mockListEvents.mockResolvedValue({ events: [makeEvent({ date: "2024-06-15", startDate: "", endDate: "" })] });
      const result = await listEvents({});
      expect(result).toContain("2024-06-15");
    });

    it("shows start–end range for span events", async () => {
      mockListEvents.mockResolvedValue({
        events: [makeEvent({ date: "", startDate: "2024-01-01", endDate: "2024-12-31", type: EventType.EVENT_TYPE_SPAN })],
      });
      const result = await listEvents({});
      expect(result).toContain("2024-01-01 – 2024-12-31");
    });

    it('shows "no date" when all date fields are empty', async () => {
      mockListEvents.mockResolvedValue({ events: [makeEvent({ date: "", startDate: "", endDate: "" })] });
      const result = await listEvents({});
      expect(result).toContain("no date");
    });

    it("shows event type label", async () => {
      mockListEvents.mockResolvedValue({
        events: [makeEvent({ type: EventType.EVENT_TYPE_POINT })],
      });
      const result = await listEvents({});
      expect(result).toContain("EVENT_TYPE_POINT");
    });

    it("truncates description longer than 80 chars", async () => {
      const long = "x".repeat(90);
      mockListEvents.mockResolvedValue({ events: [makeEvent({ description: long })] });
      const result = await listEvents({});
      expect(result).toContain("x".repeat(80) + "…");
      expect(result).not.toContain("x".repeat(81));
    });

    it("does not truncate description of exactly 80 chars", async () => {
      const exact = "y".repeat(80);
      mockListEvents.mockResolvedValue({ events: [makeEvent({ description: exact })] });
      const result = await listEvents({});
      expect(result).toContain(exact);
      expect(result).not.toContain("…");
    });

    it("omits description section when description is empty", async () => {
      mockListEvents.mockResolvedValue({ events: [makeEvent({ description: "" })] });
      const result = await listEvents({});
      const eventLine = result.split("\n").find((l) => l.includes("evt-1"))!;
      expect(eventLine.endsWith("]")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("returns a readable error string on gRPC failure", async () => {
      mockListEvents.mockRejectedValue(new ClientError("/foo/ListEvents", Status.NOT_FOUND, "not found"));
      const result = await listEvents({});
      expect(result).toBe("Not found: not found");
    });

    it("does not throw on gRPC error", async () => {
      mockListEvents.mockRejectedValue(new ClientError("/foo/ListEvents", Status.INTERNAL, "boom"));
      await expect(listEvents({})).resolves.toBeTypeOf("string");
    });
  });
});
