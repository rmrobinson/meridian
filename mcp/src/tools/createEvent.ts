import { z } from "zod";
import { client } from "../client.js";
import { mapGrpcError } from "../errors.js";
import {
  EventType,
  Visibility,
} from "../../proto-gen/meridian/v1/timeline.js";
import { metadataSchemaFields, buildMetadata, MetadataArgs } from "./metadata.js";

export const createEventSchema = {
  title: z.string().optional().describe("Title of the event (optional for books, which use ISBN for enrichment)"),
  family_id: z
    .enum(["spine", "employment", "education", "hobbies", "travel", "flights", "books", "film_tv", "fitness"])
    .describe("Timeline family this event belongs to"),
  type: z
    .enum(["span", "point"])
    .describe("span = event with duration; point = single moment"),
  date: z.string().optional().describe("Date for point events (ISO 8601, e.g. 2024-06-15)"),
  start_date: z.string().optional().describe("Start date for span events (ISO 8601)"),
  end_date: z.string().optional().describe("End date for span events (ISO 8601)"),
  description: z.string().optional().describe("Free-text description of the event"),
  visibility: z
    .enum(["personal", "family", "friends", "public"])
    .optional()
    .describe("Visibility level (defaults to personal)"),
  line_key: z.string().optional().describe("Line key within the family"),
  parent_line_key: z.string().optional().describe("Parent line key for nested timelines"),
  location_label: z.string().optional().describe("Human-readable location name"),
  location_lat: z.number().optional().describe("Location latitude"),
  location_lng: z.number().optional().describe("Location longitude"),
  external_url: z.string().optional().describe("URL to an external resource for this event"),
  label: z.string().optional().describe("Short display label (overrides default)"),
  icon: z.string().optional().describe("Icon identifier for the event"),
  source_event_id: z.string().optional().describe("ID from the originating external source"),
  // Per-family typed metadata — provide the one matching family_id
  ...metadataSchemaFields,
};

const visibilityMap: Record<string, Visibility> = {
  personal: Visibility.VISIBILITY_PERSONAL,
  family: Visibility.VISIBILITY_FAMILY,
  friends: Visibility.VISIBILITY_FRIENDS,
  public: Visibility.VISIBILITY_PUBLIC,
};

type CreateEventArgs = {
  title?: string;
  family_id: string;
  type: "span" | "point";
  date?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  visibility?: string;
  line_key?: string;
  parent_line_key?: string;
  location_label?: string;
  location_lat?: number;
  location_lng?: number;
  external_url?: string;
  label?: string;
  icon?: string;
  source_event_id?: string;
} & MetadataArgs;

export async function createEvent(args: CreateEventArgs) {
  const hasLocation =
    args.location_label !== undefined ||
    args.location_lat !== undefined ||
    args.location_lng !== undefined;

  try {
    const response = await client.createEvent({
      title: args.title ?? "",
      familyId: args.family_id,
      type: args.type === "span" ? EventType.EVENT_TYPE_SPAN : EventType.EVENT_TYPE_POINT,
      date: args.date ?? "",
      startDate: args.start_date ?? "",
      endDate: args.end_date ?? "",
      description: args.description ?? "",
      visibility: args.visibility
        ? (visibilityMap[args.visibility] ?? Visibility.VISIBILITY_PERSONAL)
        : Visibility.VISIBILITY_PERSONAL,
      lineKey: args.line_key ?? "",
      parentLineKey: args.parent_line_key ?? "",
      location: hasLocation
        ? { label: args.location_label ?? "", lat: args.location_lat ?? 0, lng: args.location_lng ?? 0 }
        : undefined,
      externalUrl: args.external_url ?? "",
      label: args.label ?? "",
      icon: args.icon ?? "",
      sourceEventId: args.source_event_id ?? "",
      ...buildMetadata(args),
    });

    const event = response.event;
    if (!event) {
      return "Event created but no event data returned.";
    }
    return `Created event: [${event.id}] ${event.title}`;
  } catch (err) {
    return mapGrpcError(err);
  }
}
