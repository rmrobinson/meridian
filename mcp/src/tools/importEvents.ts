import { z } from "zod";
import { client } from "../client.js";
import {
  EventType,
  ActivityType,
  Visibility,
  ConflictStrategy,
} from "../../proto-gen/meridian/v1/timeline.js";

const eventInputSchema = z.object({
  title: z.string().describe("Title of the event"),
  family_id: z
    .enum(["spine", "employment", "education", "hobbies", "travel", "flights", "books", "film_tv", "fitness"])
    .describe("Timeline family this event belongs to"),
  type: z.enum(["span", "point"]).describe("span = event with duration; point = single moment"),
  date: z.string().optional().describe("Date for point events (ISO 8601)"),
  start_date: z.string().optional().describe("Start date for span events (ISO 8601)"),
  end_date: z.string().optional().describe("End date for span events (ISO 8601)"),
  description: z.string().optional().describe("Free-text description"),
  activity_type: z
    .enum(["run", "cycle", "hike", "ski", "scuba", "climb", "golf", "squash", "concert", "flight", "book", "movie", "tv"])
    .optional()
    .describe("Specific activity type"),
  visibility: z
    .enum(["personal", "family", "friends", "public"])
    .optional()
    .describe("Visibility level (defaults to personal)"),
  line_key: z.string().optional().describe("Line key within the family"),
  parent_line_key: z.string().optional().describe("Parent line key for nested timelines"),
  location_label: z.string().optional().describe("Human-readable location name"),
  location_lat: z.number().optional().describe("Location latitude"),
  location_lng: z.number().optional().describe("Location longitude"),
  external_url: z.string().optional().describe("URL to an external resource"),
  metadata: z.string().optional().describe("Family-specific metadata as a JSON string"),
  label: z.string().optional().describe("Short display label"),
  icon: z.string().optional().describe("Icon identifier"),
  source_event_id: z.string().optional().describe("ID from the originating external source"),
});

export const importEventsSchema = {
  events: z.array(eventInputSchema).describe("List of events to import"),
  source_service: z.string().describe("Name of the service or source these events originate from"),
  conflict_strategy: z
    .enum(["upsert", "skip"])
    .optional()
    .describe("How to handle events that already exist by source_event_id: upsert overwrites, skip leaves them unchanged (default: skip)"),
};

const activityTypeMap: Record<string, ActivityType> = {
  run: ActivityType.ACTIVITY_TYPE_RUN,
  cycle: ActivityType.ACTIVITY_TYPE_CYCLE,
  hike: ActivityType.ACTIVITY_TYPE_HIKE,
  ski: ActivityType.ACTIVITY_TYPE_SKI,
  scuba: ActivityType.ACTIVITY_TYPE_SCUBA,
  climb: ActivityType.ACTIVITY_TYPE_CLIMB,
  golf: ActivityType.ACTIVITY_TYPE_GOLF,
  squash: ActivityType.ACTIVITY_TYPE_SQUASH,
  concert: ActivityType.ACTIVITY_TYPE_CONCERT,
  flight: ActivityType.ACTIVITY_TYPE_FLIGHT,
  book: ActivityType.ACTIVITY_TYPE_BOOK,
  movie: ActivityType.ACTIVITY_TYPE_MOVIE,
  tv: ActivityType.ACTIVITY_TYPE_TV,
};

const visibilityMap: Record<string, Visibility> = {
  personal: Visibility.VISIBILITY_PERSONAL,
  family: Visibility.VISIBILITY_FAMILY,
  friends: Visibility.VISIBILITY_FRIENDS,
  public: Visibility.VISIBILITY_PUBLIC,
};

type EventInput = z.infer<typeof eventInputSchema>;

function toCreateEventRequest(e: EventInput) {
  const hasLocation =
    e.location_label !== undefined ||
    e.location_lat !== undefined ||
    e.location_lng !== undefined;

  return {
    title: e.title,
    familyId: e.family_id,
    type: e.type === "span" ? EventType.EVENT_TYPE_SPAN : EventType.EVENT_TYPE_POINT,
    date: e.date ?? "",
    startDate: e.start_date ?? "",
    endDate: e.end_date ?? "",
    description: e.description ?? "",
    activityType: e.activity_type
      ? (activityTypeMap[e.activity_type] ?? ActivityType.ACTIVITY_TYPE_UNSPECIFIED)
      : ActivityType.ACTIVITY_TYPE_UNSPECIFIED,
    visibility: e.visibility
      ? (visibilityMap[e.visibility] ?? Visibility.VISIBILITY_PERSONAL)
      : Visibility.VISIBILITY_PERSONAL,
    lineKey: e.line_key ?? "",
    parentLineKey: e.parent_line_key ?? "",
    location: hasLocation
      ? { label: e.location_label ?? "", lat: e.location_lat ?? 0, lng: e.location_lng ?? 0 }
      : undefined,
    externalUrl: e.external_url ?? "",
    metadata: e.metadata ?? "",
    label: e.label ?? "",
    icon: e.icon ?? "",
    sourceEventId: e.source_event_id ?? "",
    id: "",
    heroImageUrl: "",
    endIcon: "",
  };
}

export async function importEvents(args: {
  events: EventInput[];
  source_service: string;
  conflict_strategy?: "upsert" | "skip";
}) {
  const strategy =
    args.conflict_strategy === "upsert"
      ? ConflictStrategy.CONFLICT_STRATEGY_UPSERT
      : ConflictStrategy.CONFLICT_STRATEGY_SKIP;

  const response = await client.importEvents({
    events: args.events.map(toCreateEventRequest),
    sourceService: args.source_service,
    conflictStrategy: strategy,
  });

  const parts = [`Imported ${args.events.length} event(s):`];
  parts.push(`  created: ${response.created}`);
  parts.push(`  updated: ${response.updated}`);
  parts.push(`  skipped: ${response.skipped}`);
  parts.push(`  failed:  ${response.failed}`);
  if (response.errors.length > 0) {
    parts.push(`Errors:\n${response.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return parts.join("\n");
}
