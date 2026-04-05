import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientError, Status } from "nice-grpc-common";
import { ConflictStrategy, EventType, Visibility } from "../../../proto-gen/meridian/v1/timeline.js";

vi.mock("../../client.js", () => ({
  client: { importEvents: vi.fn() },
}));

import { client } from "../../client.js";
import { importEvents } from "../../tools/importEvents.js";

const mockImportEvents = vi.mocked(client.importEvents);

const baseEventInput = {
  title: "Event A",
  family_id: "spine" as const,
  type: "point" as const,
};

const emptyResponse = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

describe("importEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportEvents.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
  });

  describe("conflict_strategy mapping", () => {
    it('maps "upsert" to CONFLICT_STRATEGY_UPSERT', async () => {
      await importEvents({ events: [baseEventInput], source_service: "test", conflict_strategy: "upsert" });
      expect(mockImportEvents).toHaveBeenCalledWith(
        expect.objectContaining({ conflictStrategy: ConflictStrategy.CONFLICT_STRATEGY_UPSERT })
      );
    });

    it('maps "skip" to CONFLICT_STRATEGY_SKIP', async () => {
      await importEvents({ events: [baseEventInput], source_service: "test", conflict_strategy: "skip" });
      expect(mockImportEvents).toHaveBeenCalledWith(
        expect.objectContaining({ conflictStrategy: ConflictStrategy.CONFLICT_STRATEGY_SKIP })
      );
    });

    it("defaults to CONFLICT_STRATEGY_SKIP when conflict_strategy is omitted", async () => {
      await importEvents({ events: [baseEventInput], source_service: "test" });
      expect(mockImportEvents).toHaveBeenCalledWith(
        expect.objectContaining({ conflictStrategy: ConflictStrategy.CONFLICT_STRATEGY_SKIP })
      );
    });
  });

  describe("event mapping", () => {
    it('maps event type "span" to EVENT_TYPE_SPAN', async () => {
      await importEvents({ events: [{ ...baseEventInput, type: "span" }], source_service: "test" });
      const call = mockImportEvents.mock.calls[0][0];
      expect(call.events[0].type).toBe(EventType.EVENT_TYPE_SPAN);
    });

    it('maps event type "point" to EVENT_TYPE_POINT', async () => {
      await importEvents({ events: [baseEventInput], source_service: "test" });
      const call = mockImportEvents.mock.calls[0][0];
      expect(call.events[0].type).toBe(EventType.EVENT_TYPE_POINT);
    });

    it("maps visibility to the correct enum value", async () => {
      await importEvents({ events: [{ ...baseEventInput, visibility: "public" }], source_service: "test" });
      const call = mockImportEvents.mock.calls[0][0];
      expect(call.events[0].visibility).toBe(Visibility.VISIBILITY_PUBLIC);
    });

    it("includes location when location fields are provided", async () => {
      await importEvents({
        events: [{ ...baseEventInput, location_label: "HQ", location_lat: 1, location_lng: 2 }],
        source_service: "test",
      });
      const call = mockImportEvents.mock.calls[0][0];
      expect(call.events[0].location).toEqual({ label: "HQ", lat: 1, lng: 2 });
    });

    it("passes source_service as sourceService on the request", async () => {
      await importEvents({ events: [baseEventInput], source_service: "my-importer" });
      expect(mockImportEvents).toHaveBeenCalledWith(
        expect.objectContaining({ sourceService: "my-importer" })
      );
    });
  });

  describe("response formatting", () => {
    it("includes created/updated/skipped/failed counts", async () => {
      mockImportEvents.mockResolvedValue({ created: 3, updated: 1, skipped: 2, failed: 0, errors: [] });
      const result = await importEvents({ events: [baseEventInput, baseEventInput, baseEventInput], source_service: "test" });
      expect(result).toContain("created: 3");
      expect(result).toContain("updated: 1");
      expect(result).toContain("skipped: 2");
      expect(result).toContain("failed:  0");
    });

    it("includes error list when errors are present", async () => {
      mockImportEvents.mockResolvedValue({ ...emptyResponse, failed: 1, errors: ["bad title on event 0"] });
      const result = await importEvents({ events: [baseEventInput], source_service: "test" });
      expect(result).toContain("bad title on event 0");
    });

    it("omits error section when errors array is empty", async () => {
      mockImportEvents.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await importEvents({ events: [baseEventInput], source_service: "test" });
      expect(result).not.toContain("Errors:");
    });
  });

  describe("error handling", () => {
    it("returns mapped error string on gRPC error", async () => {
      mockImportEvents.mockRejectedValue(
        new ClientError("/foo/ImportEvents", Status.UNAUTHENTICATED, "")
      );
      const result = await importEvents({ events: [baseEventInput], source_service: "test" });
      expect(result).toBe("Authentication failed — check BEARER_TOKEN.");
    });
  });
});
