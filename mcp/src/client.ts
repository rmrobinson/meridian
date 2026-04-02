import {
  createChannel,
  createClientFactory,
  Metadata,
  ClientMiddlewareCall,
  CallOptions,
} from "nice-grpc";
import { TimelineServiceDefinition } from "../proto-gen/meridian/v1/timeline.js";

const grpcUrl = process.env.BACKEND_GRPC_URL;
const bearerToken = process.env.BEARER_TOKEN;

if (!grpcUrl) {
  throw new Error("BACKEND_GRPC_URL environment variable is required");
}
if (!/^[^:]+:\d+$/.test(grpcUrl)) {
  throw new Error(
    `BACKEND_GRPC_URL must be a host:port string, got: "${grpcUrl}"`
  );
}
if (!bearerToken) {
  throw new Error("BEARER_TOKEN environment variable is required");
}

async function* authMiddleware<Request, Response>(
  call: ClientMiddlewareCall<Request, Response>,
  options: CallOptions
) {
  const metadata = Metadata(options.metadata ?? {});
  metadata.set("authorization", `Bearer ${bearerToken}`);
  return yield* call.next(call.request, { ...options, metadata });
}

const channel = createChannel(grpcUrl);

export const client = createClientFactory()
  .use(authMiddleware)
  .create(TimelineServiceDefinition, channel);
