import { z } from "zod";
import { client } from "../client.js";
import {
  EventType,
  ActivityType,
  Visibility,
} from "../../proto-gen/meridian/v1/timeline.js";

export const updateEventSchema = {
  id: z.string().describe("ID of the event to update"),
  title: z.string().optional().describe("New title"),
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
    .describe("Visibility level"),
  line_key: z.string().optional().describe("Line key within the family"),
  parent_line_key: z.string().optional().describe("Parent line key for nested timelines"),
  location_label: z.string().optional().describe("Human-readable location name"),
  location_lat: z.number().optional().describe("Location latitude"),
  location_lng: z.number().optional().describe("Location longitude"),
  external_url: z.string().optional().describe("URL to an external resource"),
  metadata: z.string().optional().describe("Family-specific metadata as a JSON string"),
  label: z.string().optional().describe("Short display label"),
  icon: z.string().optional().describe("Icon identifier"),
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

export async function updateEvent(args: {
  id: string;
  title?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  activity_type?: string;
  visibility?: string;
  line_key?: string;
  parent_line_key?: string;
  location_label?: string;
  location_lat?: number;
  location_lng?: number;
  external_url?: string;
  metadata?: string;
  label?: string;
  icon?: string;
}) {
  const hasLocation =
    args.location_label !== undefined ||
    args.location_lat !== undefined ||
    args.location_lng !== undefined;

  const response = await client.updateEvent({
    id: args.id,
    title: args.title ?? "",
    date: args.date ?? "",
    startDate: args.start_date ?? "",
    endDate: args.end_date ?? "",
    description: args.description ?? "",
    activityType: args.activity_type
      ? (activityTypeMap[args.activity_type] ?? ActivityType.ACTIVITY_TYPE_UNSPECIFIED)
      : ActivityType.ACTIVITY_TYPE_UNSPECIFIED,
    visibility: args.visibility
      ? (visibilityMap[args.visibility] ?? Visibility.VISIBILITY_UNSPECIFIED)
      : Visibility.VISIBILITY_UNSPECIFIED,
    lineKey: args.line_key ?? "",
    parentLineKey: args.parent_line_key ?? "",
    location: hasLocation
      ? { label: args.location_label ?? "", lat: args.location_lat ?? 0, lng: args.location_lng ?? 0 }
      : undefined,
    externalUrl: args.external_url ?? "",
    metadata: args.metadata ?? "",
    label: args.label ?? "",
    icon: args.icon ?? "",
    // type and familyId intentionally omitted — backend treats zero-value as "no change"
    type: EventType.EVENT_TYPE_UNSPECIFIED,
    familyId: "",
    endIcon: "",
  });

  const event = response.event;
  if (!event) {
    return "Event updated but no event data returned.";
  }
  return `Updated event: [${event.id}] ${event.title}`;
}
