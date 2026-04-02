import { z } from "zod";
import { client } from "../client.js";
import { mapGrpcError } from "../errors.js";

export const deleteEventSchema = {
  id: z.string().describe("ID of the event to delete"),
};

export async function deleteEvent(args: { id: string }) {
  try {
    await client.deleteEvent({ id: args.id });
    return `Event ${args.id} deleted. (This is a soft delete and can be restored by an operator.)`;
  } catch (err) {
    return mapGrpcError(err);
  }
}
