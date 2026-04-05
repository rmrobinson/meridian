import { z } from "zod";
import { client } from "../client.js";
import { mapGrpcError } from "../errors.js";
import {
  EventType,
  Visibility,
  FilmTVType,
  SpineMilestoneType,
  FitnessActivity,
  ClimbingType,
} from "../../proto-gen/meridian/v1/timeline.js";

export const updateEventSchema = {
  id: z.string().describe("ID of the event to update"),
  title: z.string().optional().describe("New title"),
  date: z.string().optional().describe("Date for point events (ISO 8601)"),
  start_date: z.string().optional().describe("Start date for span events (ISO 8601)"),
  end_date: z.string().optional().describe("End date for span events (ISO 8601)"),
  description: z.string().optional().describe("Free-text description"),
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
  label: z.string().optional().describe("Short display label"),
  icon: z.string().optional().describe("Icon identifier"),
  // Per-family typed metadata — provide the one matching the event's family
  spine_metadata: z
    .object({
      milestone_type: z.enum(["birth", "death", "marriage", "relocation", "graduation", "anniversary"]),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional()
    .describe("Metadata for spine family events"),
  employment_metadata: z
    .object({ role: z.string(), company_name: z.string(), company_url: z.string().optional() })
    .optional()
    .describe("Metadata for employment family events"),
  education_metadata: z
    .object({ institution: z.string(), degree: z.string().optional() })
    .optional()
    .describe("Metadata for education family events"),
  travel_metadata: z
    .object({ countries: z.array(z.string()).optional(), cities: z.array(z.string()).optional() })
    .optional()
    .describe("Metadata for travel family events"),
  flight_metadata: z
    .object({
      airline: z.string(), flight_number: z.string(),
      aircraft_type: z.string().optional(), tail_number: z.string().optional(),
      origin_iata: z.string().optional(), destination_iata: z.string().optional(),
      scheduled_departure: z.string().optional(), scheduled_arrival: z.string().optional(),
      actual_departure: z.string().optional(), actual_arrival: z.string().optional(),
    })
    .optional()
    .describe("Metadata for flights family events"),
  book_metadata: z
    .object({ isbn: z.string(), author: z.string().optional(), cover_image_url: z.string().optional(), preview_url: z.string().optional(), rating: z.number().int().min(0).max(10).optional(), review: z.string().optional() })
    .optional()
    .describe("Metadata for books family events"),
  film_tv_metadata: z
    .object({ tmdb_id: z.string(), type: z.enum(["movie", "tv"]), poster_url: z.string().optional(), director: z.string().optional(), network: z.string().optional(), year: z.number().int().optional(), seasons_watched: z.number().int().optional(), rating: z.number().int().min(0).max(10).optional(), review: z.string().optional() })
    .optional()
    .describe("Metadata for film_tv family events"),
  concert_metadata: z
    .object({
      main_act: z.string().describe("Name of the main act"),
      opening_acts: z.array(z.string()).optional().describe("List of opening acts"),
      venue_label: z.string().optional().describe("Venue name"),
      venue_lat: z.number().optional().describe("Venue latitude"),
      venue_lng: z.number().optional().describe("Venue longitude"),
      playlist_url: z.string().optional().describe("URL to a playlist for the concert"),
    })
    .optional()
    .describe("Metadata for hobbies family events (concerts)"),
  fitness_metadata: z
    .object({
      activity: z.enum(["run", "cycle", "hike", "ski", "scuba", "climb", "golf", "squash"]),
      duration: z.string().optional(), distance_km: z.number().optional(),
      elevation_gain_m: z.number().int().optional(), avg_heart_rate: z.number().int().optional(),
      garmin_activity_url: z.string().optional(), avg_pace_min_km: z.number().optional(),
      bike: z.string().optional(), avg_speed_kmh: z.number().optional(),
      trail_name: z.string().optional(), alltrails_url: z.string().optional(),
      resort: z.string().optional(), vertical_drop_m: z.number().int().optional(),
      runs: z.number().int().optional(), dive_site: z.string().optional(),
      max_depth_m: z.number().optional(), avg_depth_m: z.number().optional(),
      climbing_type: z.enum(["sport", "bouldering", "gym"]).optional(),
      route_name: z.string().optional(), problem_name: z.string().optional(),
      grade: z.string().optional(), course_name: z.string().optional(),
      holes: z.number().int().optional(), score: z.number().int().optional(),
      opponent: z.string().optional(), result: z.string().optional(),
    })
    .optional()
    .describe("Metadata for fitness family events"),
};

const visibilityMap: Record<string, Visibility> = {
  personal: Visibility.VISIBILITY_PERSONAL,
  family: Visibility.VISIBILITY_FAMILY,
  friends: Visibility.VISIBILITY_FRIENDS,
  public: Visibility.VISIBILITY_PUBLIC,
};

type UpdateEventArgs = {
  id: string;
  title?: string;
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
  spine_metadata?: { milestone_type: string; from?: string; to?: string };
  employment_metadata?: { role: string; company_name: string; company_url?: string };
  education_metadata?: { institution: string; degree?: string };
  travel_metadata?: { countries?: string[]; cities?: string[] };
  flight_metadata?: { airline: string; flight_number: string; aircraft_type?: string; tail_number?: string; origin_iata?: string; destination_iata?: string; scheduled_departure?: string; scheduled_arrival?: string; actual_departure?: string; actual_arrival?: string };
  book_metadata?: { isbn: string; author?: string; cover_image_url?: string; preview_url?: string; rating?: number; review?: string };
  film_tv_metadata?: { tmdb_id: string; type: "movie" | "tv"; poster_url?: string; director?: string; network?: string; year?: number; seasons_watched?: number; rating?: number; review?: string };
  concert_metadata?: { main_act: string; opening_acts?: string[]; venue_label?: string; venue_lat?: number; venue_lng?: number; playlist_url?: string };
  fitness_metadata?: { activity: string; duration?: string; distance_km?: number; elevation_gain_m?: number; avg_heart_rate?: number; garmin_activity_url?: string; avg_pace_min_km?: number; bike?: string; avg_speed_kmh?: number; trail_name?: string; alltrails_url?: string; resort?: string; vertical_drop_m?: number; runs?: number; dive_site?: string; max_depth_m?: number; avg_depth_m?: number; climbing_type?: string; route_name?: string; problem_name?: string; grade?: string; course_name?: string; holes?: number; score?: number; opponent?: string; result?: string };
};

const spineMilestoneTypeMap: Record<string, SpineMilestoneType> = {
  birth: SpineMilestoneType.SPINE_MILESTONE_TYPE_BIRTH,
  death: SpineMilestoneType.SPINE_MILESTONE_TYPE_DEATH,
  marriage: SpineMilestoneType.SPINE_MILESTONE_TYPE_MARRIAGE,
  relocation: SpineMilestoneType.SPINE_MILESTONE_TYPE_RELOCATION,
  graduation: SpineMilestoneType.SPINE_MILESTONE_TYPE_GRADUATION,
  anniversary: SpineMilestoneType.SPINE_MILESTONE_TYPE_ANNIVERSARY,
};

const fitnessActivityMap: Record<string, FitnessActivity> = {
  run: FitnessActivity.FITNESS_ACTIVITY_RUN,
  cycle: FitnessActivity.FITNESS_ACTIVITY_CYCLE,
  hike: FitnessActivity.FITNESS_ACTIVITY_HIKE,
  ski: FitnessActivity.FITNESS_ACTIVITY_SKI,
  scuba: FitnessActivity.FITNESS_ACTIVITY_SCUBA,
  climb: FitnessActivity.FITNESS_ACTIVITY_CLIMB,
  golf: FitnessActivity.FITNESS_ACTIVITY_GOLF,
  squash: FitnessActivity.FITNESS_ACTIVITY_SQUASH,
};

const climbingTypeMap: Record<string, ClimbingType> = {
  sport: ClimbingType.CLIMBING_TYPE_SPORT,
  bouldering: ClimbingType.CLIMBING_TYPE_BOULDERING,
  gym: ClimbingType.CLIMBING_TYPE_GYM,
};

function buildMetadata(args: UpdateEventArgs) {
  if (args.spine_metadata) {
    return { spineMetadata: { milestoneType: spineMilestoneTypeMap[args.spine_metadata.milestone_type] ?? SpineMilestoneType.SPINE_MILESTONE_TYPE_UNSPECIFIED, from: args.spine_metadata.from ?? "", to: args.spine_metadata.to ?? "" } };
  }
  if (args.employment_metadata) {
    return { employmentMetadata: { role: args.employment_metadata.role, companyName: args.employment_metadata.company_name, companyUrl: args.employment_metadata.company_url ?? "" } };
  }
  if (args.education_metadata) {
    return { educationMetadata: { institution: args.education_metadata.institution, degree: args.education_metadata.degree ?? "" } };
  }
  if (args.travel_metadata) {
    return { travelMetadata: { countries: args.travel_metadata.countries ?? [], cities: args.travel_metadata.cities ?? [] } };
  }
  if (args.flight_metadata) {
    const f = args.flight_metadata;
    return { flightMetadata: { airline: f.airline, flightNumber: f.flight_number, aircraftType: f.aircraft_type ?? "", tailNumber: f.tail_number ?? "", originIata: f.origin_iata ?? "", destinationIata: f.destination_iata ?? "", scheduledDeparture: f.scheduled_departure ?? "", scheduledArrival: f.scheduled_arrival ?? "", actualDeparture: f.actual_departure ?? "", actualArrival: f.actual_arrival ?? "" } };
  }
  if (args.book_metadata) {
    const b = args.book_metadata;
    return { bookMetadata: { isbn: b.isbn, author: b.author ?? "", coverImageUrl: b.cover_image_url ?? "", previewUrl: b.preview_url ?? "", rating: b.rating ?? 0, review: b.review ?? "" } };
  }
  if (args.film_tv_metadata) {
    const f = args.film_tv_metadata;
    return { filmTvMetadata: { tmdbId: f.tmdb_id, type: f.type === "movie" ? FilmTVType.FILM_TV_TYPE_MOVIE : FilmTVType.FILM_TV_TYPE_TV, posterUrl: f.poster_url ?? "", director: f.director ?? "", network: f.network ?? "", year: f.year ?? 0, seasonsWatched: f.seasons_watched, rating: f.rating ?? 0, review: f.review ?? "" } };
  }
  if (args.concert_metadata) {
    const c = args.concert_metadata;
    const venue = (c.venue_label !== undefined || c.venue_lat !== undefined || c.venue_lng !== undefined)
      ? { label: c.venue_label ?? "", lat: c.venue_lat ?? 0, lng: c.venue_lng ?? 0 }
      : undefined;
    return { concertMetadata: { mainAct: c.main_act, openingActs: c.opening_acts ?? [], venue, playlistUrl: c.playlist_url ?? "" } };
  }
  if (args.fitness_metadata) {
    const f = args.fitness_metadata;
    return { fitnessMetadata: { activity: fitnessActivityMap[f.activity] ?? FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED, duration: f.duration ?? "", distanceKm: f.distance_km, elevationGainM: f.elevation_gain_m, avgHeartRate: f.avg_heart_rate, garminActivityUrl: f.garmin_activity_url ?? "", avgPaceMinKm: f.avg_pace_min_km, bike: f.bike ?? "", avgSpeedKmh: f.avg_speed_kmh, trailName: f.trail_name ?? "", alltrailsUrl: f.alltrails_url ?? "", resort: f.resort ?? "", verticalDropM: f.vertical_drop_m, runs: f.runs, diveSite: f.dive_site ?? "", maxDepthM: f.max_depth_m, avgDepthM: f.avg_depth_m, climbingType: climbingTypeMap[f.climbing_type ?? ""] ?? ClimbingType.CLIMBING_TYPE_UNSPECIFIED, routeName: f.route_name ?? "", problemName: f.problem_name ?? "", grade: f.grade ?? "", courseName: f.course_name ?? "", holes: f.holes, score: f.score, opponent: f.opponent ?? "", result: f.result ?? "" } };
  }
  return {};
}

export async function updateEvent(args: UpdateEventArgs) {
  const hasLocation =
    args.location_label !== undefined ||
    args.location_lat !== undefined ||
    args.location_lng !== undefined;

  try {
    const response = await client.updateEvent({
      id: args.id,
      title: args.title ?? "",
      date: args.date ?? "",
      startDate: args.start_date ?? "",
      endDate: args.end_date ?? "",
      description: args.description ?? "",
      visibility: args.visibility
        ? (visibilityMap[args.visibility] ?? Visibility.VISIBILITY_UNSPECIFIED)
        : Visibility.VISIBILITY_UNSPECIFIED,
      lineKey: args.line_key ?? "",
      parentLineKey: args.parent_line_key ?? "",
      location: hasLocation
        ? { label: args.location_label ?? "", lat: args.location_lat ?? 0, lng: args.location_lng ?? 0 }
        : undefined,
      externalUrl: args.external_url ?? "",
      label: args.label ?? "",
      icon: args.icon ?? "",
      // type and familyId intentionally omitted — backend treats zero-value as "no change"
      type: EventType.EVENT_TYPE_UNSPECIFIED,
      familyId: "",
      endIcon: "",
      ...buildMetadata(args),
    });

    const event = response.event;
    if (!event) {
      return "Event updated but no event data returned.";
    }
    return `Updated event: [${event.id}] ${event.title}`;
  } catch (err) {
    return mapGrpcError(err);
  }
}
