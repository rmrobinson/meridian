import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientError, Status } from "nice-grpc-common";

vi.mock("../../client.js", () => ({
  client: { deleteEvent: vi.fn() },
}));

import { client } from "../../client.js";
import { deleteEvent } from "../../tools/deleteEvent.js";

const mockDeleteEvent = vi.mocked(client.deleteEvent);

describe("deleteEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteEvent.mockResolvedValue({});
  });

  it("calls client.deleteEvent with the provided id", async () => {
    await deleteEvent({ id: "evt-42" });
    expect(mockDeleteEvent).toHaveBeenCalledWith({ id: "evt-42" });
  });

  it("returns a confirmation message containing the id", async () => {
    const result = await deleteEvent({ id: "evt-42" });
    expect(result).toContain("evt-42");
  });

  it("mentions soft delete in the confirmation message", async () => {
    const result = await deleteEvent({ id: "evt-42" });
    expect(result.toLowerCase()).toContain("soft delete");
  });

  it("returns mapped error string on gRPC NOT_FOUND", async () => {
    mockDeleteEvent.mockRejectedValue(
      new ClientError("/foo/DeleteEvent", Status.NOT_FOUND, "no such event")
    );
    const result = await deleteEvent({ id: "missing" });
    expect(result).toBe("Not found: no such event");
  });

  it("returns mapped error string on gRPC UNAUTHENTICATED", async () => {
    mockDeleteEvent.mockRejectedValue(
      new ClientError("/foo/DeleteEvent", Status.UNAUTHENTICATED, "")
    );
    const result = await deleteEvent({ id: "evt-1" });
    expect(result).toBe("Authentication failed — check BEARER_TOKEN.");
  });
});
