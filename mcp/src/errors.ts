import { ClientError, Status } from "nice-grpc-common";

export function mapGrpcError(err: unknown): string {
  if (!(err instanceof ClientError)) {
    console.error("Unexpected non-gRPC error:", err);
    throw err;
  }

  switch (err.code) {
    case Status.NOT_FOUND:
      return `Not found: ${err.details}`;
    case Status.INVALID_ARGUMENT:
      return err.details;
    case Status.UNAUTHENTICATED:
    case Status.PERMISSION_DENIED:
      return "Authentication failed — check BEARER_TOKEN.";
    default:
      console.error(`Unexpected backend error [${Status[err.code]}]: ${err.details}`);
      return `Backend error (${Status[err.code]}): ${err.details}`;
  }
}
