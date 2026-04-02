import { describe, it, expect, vi, afterEach } from "vitest";
import { ClientError, Status } from "nice-grpc-common";
import { mapGrpcError } from "../errors.js";

describe("mapGrpcError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps NOT_FOUND to a readable message", () => {
    const err = new ClientError("/meridian.v1.TimelineService/DeleteEvent", Status.NOT_FOUND, "event missing");
    expect(mapGrpcError(err)).toBe("Not found: event missing");
  });

  it("passes INVALID_ARGUMENT details through verbatim", () => {
    const err = new ClientError("/meridian.v1.TimelineService/CreateEvent", Status.INVALID_ARGUMENT, "title is required");
    expect(mapGrpcError(err)).toBe("title is required");
  });

  it("maps UNAUTHENTICATED to the auth error message", () => {
    const err = new ClientError("/meridian.v1.TimelineService/ListEvents", Status.UNAUTHENTICATED, "bad token");
    expect(mapGrpcError(err)).toBe("Authentication failed — check BEARER_TOKEN.");
  });

  it("maps PERMISSION_DENIED to the same auth error message", () => {
    const err = new ClientError("/meridian.v1.TimelineService/ListEvents", Status.PERMISSION_DENIED, "denied");
    expect(mapGrpcError(err)).toBe("Authentication failed — check BEARER_TOKEN.");
  });

  it("maps other codes to a generic backend error string", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new ClientError("/meridian.v1.TimelineService/CreateEvent", Status.INTERNAL, "db exploded");
    expect(mapGrpcError(err)).toBe("Backend error (INTERNAL): db exploded");
  });

  it("logs to stderr for unmapped status codes", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new ClientError("/foo/Bar", Status.INTERNAL, "kaboom");
    mapGrpcError(err);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("does not log to stderr for mapped status codes", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mapGrpcError(new ClientError("/foo/Bar", Status.NOT_FOUND, "x"));
    mapGrpcError(new ClientError("/foo/Bar", Status.INVALID_ARGUMENT, "x"));
    mapGrpcError(new ClientError("/foo/Bar", Status.UNAUTHENTICATED, "x"));
    mapGrpcError(new ClientError("/foo/Bar", Status.PERMISSION_DENIED, "x"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("re-throws non-ClientError errors", () => {
    const plain = new Error("something weird");
    expect(() => mapGrpcError(plain)).toThrow("something weird");
  });
});
