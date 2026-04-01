import { z } from "zod";
import { client } from "../client.js";
import {
  Visibility,
  visibilityFromJSON,
  activityTypeToJSON,
  eventTypeToJSON,
  visibilityToJSON,
} from "../../proto-gen/meridian/v1/timeline.js";

export const listEventsSchema = {
  family_id: z
    .string()
    .optional()
    .describe("Filter by family ID (e.g. spine, employment, books)"),
  from: z
    .string()
    .optional()
    .describe("Return events on or after this date (ISO 8601, e.g. 2024-01-01)"),
  to: z
    .string()
    .optional()
    .describe("Return events on or before this date (ISO 8601, e.g. 2024-12-31)"),
  visibilities: z
    .array(z.enum(["public", "friends", "family", "personal"]))
    .optional()
    .describe("Filter by visibility levels; omit to return all"),
};

function formatEvent(e: {
  id: string;
  familyId: string;
  title: string;
  type: number;
  activityType: number;
  date: string;
  startDate: string;
  endDate: string;
  visibility: number;
  description: string;
}): string {
  const dateStr = e.date || (e.startDate && e.endDate ? `${e.startDate} – ${e.endDate}` : e.startDate || e.endDate || "no date");
  const type = activityTypeToJSON(e.activityType) !== "ACTIVITY_TYPE_UNSPECIFIED"
    ? activityTypeToJSON(e.activityType)
    : eventTypeToJSON(e.type);
  const vis = visibilityToJSON(e.visibility);
  const desc = e.description ? `  ${e.description.slice(0, 80)}${e.description.length > 80 ? "…" : ""}` : "";
  return `[${e.id}] ${e.title} (${e.familyId} / ${type}) ${dateStr} [${vis}]${desc}`;
}

export async function listEvents(args: {
  family_id?: string;
  from?: string;
  to?: string;
  visibilities?: Array<"public" | "friends" | "family" | "personal">;
}) {
  const visibilityMap: Record<string, Visibility> = {
    public: Visibility.VISIBILITY_PUBLIC,
    friends: Visibility.VISIBILITY_FRIENDS,
    family: Visibility.VISIBILITY_FAMILY,
    personal: Visibility.VISIBILITY_PERSONAL,
  };

  const response = await client.listEvents({
    familyId: args.family_id ?? "",
    from: args.from ?? "",
    to: args.to ?? "",
    visibilities: args.visibilities?.map((v) => visibilityMap[v]) ?? [],
  });

  if (response.events.length === 0) {
    return "No events found matching the given filters.";
  }

  const lines = response.events.map(formatEvent);
  return `${response.events.length} event(s):\n\n${lines.join("\n")}`;
}
