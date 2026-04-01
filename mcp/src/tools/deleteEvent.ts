import { z } from "zod";
import { client } from "../client.js";

export const deleteEventSchema = {
  id: z.string().describe("ID of the event to delete"),
};

export async function deleteEvent(args: { id: string }) {
  await client.deleteEvent({ id: args.id });
  return `Event ${args.id} deleted. (This is a soft delete and can be restored by an operator.)`;
}
