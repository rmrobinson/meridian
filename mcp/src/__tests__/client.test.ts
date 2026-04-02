import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("nice-grpc", () => ({
  createChannel: vi.fn(() => ({})),
  createClient: vi.fn(() => ({})),
  Metadata: vi.fn(() => ({ set: vi.fn() })),
}));

describe("client startup validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("BACKEND_GRPC_URL", "localhost:9090");
    vi.stubEnv("BEARER_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when BACKEND_GRPC_URL is missing", async () => {
    vi.stubEnv("BACKEND_GRPC_URL", "");
    await expect(import("../client.js")).rejects.toThrow("BACKEND_GRPC_URL");
  });

  it("throws when BEARER_TOKEN is missing", async () => {
    vi.stubEnv("BEARER_TOKEN", "");
    await expect(import("../client.js")).rejects.toThrow("BEARER_TOKEN");
  });

  it("throws when BACKEND_GRPC_URL has no port", async () => {
    vi.stubEnv("BACKEND_GRPC_URL", "localhost");
    await expect(import("../client.js")).rejects.toThrow("BACKEND_GRPC_URL must be a host:port");
  });

  it("throws when BACKEND_GRPC_URL has no host", async () => {
    vi.stubEnv("BACKEND_GRPC_URL", ":9090");
    await expect(import("../client.js")).rejects.toThrow("BACKEND_GRPC_URL must be a host:port");
  });

  it("exports a client object when both env vars are valid", async () => {
    const mod = await import("../client.js");
    expect(mod.client).toBeDefined();
  });
});
