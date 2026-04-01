import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "./client.js"; // validates BACKEND_GRPC_URL and BEARER_TOKEN at startup

import { listEventsSchema, listEvents } from "./tools/listEvents.js";
import { createEventSchema, createEvent } from "./tools/createEvent.js";
import { updateEventSchema, updateEvent } from "./tools/updateEvent.js";
import { deleteEventSchema, deleteEvent } from "./tools/deleteEvent.js";
import { importEventsSchema, importEvents } from "./tools/importEvents.js";

const server = new McpServer({
  name: "meridian",
  version: "0.1.0",
});

server.tool(
  "list_events",
  "List Meridian timeline events, optionally filtered by family, date range, or visibility",
  listEventsSchema,
  async ({ family_id, from, to, visibilities }) =>
    ({ content: [{ type: "text", text: await listEvents({ family_id, from, to, visibilities }) }] })
);

server.tool(
  "create_event",
  "Create a new Meridian timeline event",
  createEventSchema,
  async (args) =>
    ({ content: [{ type: "text", text: await createEvent(args) }] })
);

server.tool(
  "update_event",
  "Update fields on an existing Meridian timeline event",
  updateEventSchema,
  async (args) =>
    ({ content: [{ type: "text", text: await updateEvent(args) }] })
);

server.tool(
  "delete_event",
  "Soft-delete a Meridian timeline event by ID (recoverable by an operator)",
  deleteEventSchema,
  async ({ id }) =>
    ({ content: [{ type: "text", text: await deleteEvent({ id }) }] })
);

server.tool(
  "import_events",
  "Bulk-import events into Meridian from an external source with configurable conflict resolution",
  importEventsSchema,
  async (args) =>
    ({ content: [{ type: "text", text: await importEvents(args) }] })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
