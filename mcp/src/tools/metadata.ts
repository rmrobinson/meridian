import { z } from "zod";
import {
  FilmTVType,
  LifeMilestoneType,
  FitnessActivity,
  ClimbingType,
} from "../../proto-gen/meridian/v1/timeline.js";

// --- Per-family metadata Zod schemas ---

export const spineMetadataSchema = z
  .object({
    milestone_type: z
      .enum(["birth", "death", "marriage", "relocation", "graduation", "anniversary"])
      .describe("Type of life milestone"),
    from: z.string().optional().describe("Origin location (for relocation)"),
    to: z.string().optional().describe("Destination location (for relocation)"),
  })
  .optional()
  .describe("Required for spine family events");

export const employmentMetadataSchema = z
  .object({
    role: z.string().describe("Job title or role"),
    company_name: z.string().describe("Employer name"),
    company_url: z.string().optional().describe("Employer website URL"),
    role_details_url: z.string().optional().describe("URL linking to details about the role"),
  })
  .optional()
  .describe("Required for employment family events");

export const educationMetadataSchema = z
  .object({
    institution: z.string().describe("School or university name"),
    degree: z.string().optional().describe("Degree or certification earned"),
  })
  .optional()
  .describe("Required for education family events");

export const travelMetadataSchema = z
  .object({
    countries: z.array(z.string()).optional().describe("List of countries visited"),
    cities: z.array(z.string()).optional().describe("List of cities visited"),
  })
  .optional()
  .describe("Optional for travel family events");

export const flightMetadataSchema = z
  .object({
    airline: z.string().describe("Airline name (required)"),
    flight_number: z.string().describe("Flight number, e.g. AC123 (required)"),
    aircraft_type: z.string().optional().describe("Aircraft model, e.g. Boeing 737"),
    tail_number: z.string().optional().describe("Aircraft tail/registration number"),
    origin_iata: z.string().optional().describe("Origin airport IATA code, e.g. YYZ"),
    destination_iata: z.string().optional().describe("Destination airport IATA code"),
    scheduled_departure: z.string().optional().describe("Scheduled departure (ISO 8601)"),
    scheduled_arrival: z.string().optional().describe("Scheduled arrival (ISO 8601)"),
    actual_departure: z.string().optional().describe("Actual departure (ISO 8601)"),
    actual_arrival: z.string().optional().describe("Actual arrival (ISO 8601)"),
  })
  .optional()
  .describe("Required for flights family events");

export const bookMetadataSchema = z
  .object({
    isbn: z.string().optional().describe("ISBN-13 (optional if title is provided; used for enrichment)"),
    title: z.string().optional().describe("Book title"),
    author: z.string().optional().describe("Author name"),
    cover_image_url: z.string().optional().describe("Cover image URL"),
    preview_url: z.string().optional().describe("Preview or buy URL"),
    rating: z.number().int().min(0).max(10).optional().describe("Rating out of 10"),
    review: z.string().optional().describe("Personal review or notes"),
  })
  .optional()
  .describe("Required for books family events");

export const filmTvMetadataSchema = z
  .object({
    tmdb_id: z.string().optional().describe("TMDB ID (enriched automatically if omitted)"),
    type: z
      .enum(["movie", "tv"])
      .describe("Whether this is a movie or TV show (required)"),
    poster_url: z.string().optional().describe("Poster image URL"),
    director: z.string().optional().describe("Director name (movies)"),
    network: z.string().optional().describe("Broadcast network (TV shows)"),
    year: z.number().int().optional().describe("Release year"),
    seasons_watched: z.number().int().optional().describe("Number of seasons watched (TV)"),
    rating: z.number().int().min(0).max(10).optional().describe("Rating out of 10"),
    review: z.string().optional().describe("Personal review or notes"),
  })
  .optional()
  .describe("Required for film_tv family events");

export const concertMetadataSchema = z
  .object({
    main_act: z.string().describe("Name of the main act (required)"),
    opening_acts: z.array(z.string()).optional().describe("List of opening acts"),
    venue_label: z.string().optional().describe("Venue name"),
    venue_lat: z.number().optional().describe("Venue latitude"),
    venue_lng: z.number().optional().describe("Venue longitude"),
    playlist_url: z.string().optional().describe("URL to a playlist for the concert"),
  })
  .optional()
  .describe("Required for hobbies family events (concerts)");

export const fitnessMetadataSchema = z
  .object({
    activity: z
      .enum(["run", "cycle", "hike", "ski", "scuba", "climb", "golf", "squash"])
      .describe("Type of fitness activity"),
    duration: z.string().optional().describe("Duration, e.g. 1h30m"),
    distance_km: z.number().optional().describe("Distance in kilometres"),
    elevation_gain_m: z.number().int().optional().describe("Elevation gain in metres"),
    avg_heart_rate: z.number().int().optional().describe("Average heart rate (bpm)"),
    garmin_activity_url: z.string().optional().describe("Garmin Connect activity URL"),
    // running
    avg_pace_min_km: z.number().optional().describe("Average pace in min/km (running)"),
    // cycling
    bike: z.string().optional().describe("Bike name or model (cycling)"),
    avg_speed_kmh: z.number().optional().describe("Average speed in km/h (cycling)"),
    // hiking
    trail_name: z.string().optional().describe("Trail name (hiking)"),
    alltrails_url: z.string().optional().describe("AllTrails URL (hiking)"),
    // skiing
    resort: z.string().optional().describe("Ski resort name"),
    vertical_drop_m: z.number().int().optional().describe("Vertical drop in metres (skiing)"),
    runs: z.number().int().optional().describe("Number of runs (skiing)"),
    // scuba
    dive_site: z.string().optional().describe("Dive site name"),
    max_depth_m: z.number().optional().describe("Maximum depth in metres (scuba)"),
    avg_depth_m: z.number().optional().describe("Average depth in metres (scuba)"),
    // climbing
    climbing_type: z
      .enum(["sport", "bouldering", "gym"])
      .optional()
      .describe("Climbing discipline"),
    route_name: z.string().optional().describe("Route name (sport climbing)"),
    problem_name: z.string().optional().describe("Problem name (bouldering)"),
    grade: z.string().optional().describe("Route or problem grade"),
    // golf
    course_name: z.string().optional().describe("Golf course name"),
    holes: z.number().int().optional().describe("Number of holes played"),
    score: z.number().int().optional().describe("Total score"),
    // squash
    opponent: z.string().optional().describe("Opponent name (squash)"),
    result: z.string().optional().describe("Match result, e.g. W 3-1"),
  })
  .optional()
  .describe("Required for fitness family events");

// --- Flat object of metadata schema fields (spread into tool schemas) ---

export const metadataSchemaFields = {
  life_metadata: spineMetadataSchema,
  employment_metadata: employmentMetadataSchema,
  education_metadata: educationMetadataSchema,
  travel_metadata: travelMetadataSchema,
  flight_metadata: flightMetadataSchema,
  book_metadata: bookMetadataSchema,
  film_tv_metadata: filmTvMetadataSchema,
  concert_metadata: concertMetadataSchema,
  fitness_metadata: fitnessMetadataSchema,
};

// --- Shared metadata args type ---

export type MetadataArgs = {
  life_metadata?: { milestone_type: string; from?: string; to?: string };
  employment_metadata?: { role: string; company_name: string; company_url?: string; role_details_url?: string };
  education_metadata?: { institution: string; degree?: string };
  travel_metadata?: { countries?: string[]; cities?: string[] };
  flight_metadata?: {
    airline: string; flight_number: string; aircraft_type?: string; tail_number?: string;
    origin_iata?: string; destination_iata?: string;
    scheduled_departure?: string; scheduled_arrival?: string;
    actual_departure?: string; actual_arrival?: string;
  };
  book_metadata?: { isbn?: string; title?: string; author?: string; cover_image_url?: string; preview_url?: string; rating?: number; review?: string };
  film_tv_metadata?: { tmdb_id?: string; type: "movie" | "tv"; poster_url?: string; director?: string; network?: string; year?: number; seasons_watched?: number; rating?: number; review?: string };
  concert_metadata?: { main_act: string; opening_acts?: string[]; venue_label?: string; venue_lat?: number; venue_lng?: number; playlist_url?: string };
  fitness_metadata?: {
    activity: string; duration?: string; distance_km?: number; elevation_gain_m?: number;
    avg_heart_rate?: number; garmin_activity_url?: string; avg_pace_min_km?: number;
    bike?: string; avg_speed_kmh?: number; trail_name?: string; alltrails_url?: string;
    resort?: string; vertical_drop_m?: number; runs?: number; dive_site?: string;
    max_depth_m?: number; avg_depth_m?: number; climbing_type?: string;
    route_name?: string; problem_name?: string; grade?: string;
    course_name?: string; holes?: number; score?: number; opponent?: string; result?: string;
  };
};

// --- Enum maps ---

const lifeMilestoneTypeMap: Record<string, LifeMilestoneType> = {
  birth: LifeMilestoneType.LIFE_MILESTONE_TYPE_BIRTH,
  death: LifeMilestoneType.LIFE_MILESTONE_TYPE_DEATH,
  marriage: LifeMilestoneType.LIFE_MILESTONE_TYPE_MARRIAGE,
  relocation: LifeMilestoneType.LIFE_MILESTONE_TYPE_RELOCATION,
  graduation: LifeMilestoneType.LIFE_MILESTONE_TYPE_GRADUATION,
  anniversary: LifeMilestoneType.LIFE_MILESTONE_TYPE_ANNIVERSARY,
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

// --- Shared buildMetadata ---

export function buildMetadata(args: MetadataArgs): object {
  if (args.life_metadata) {
    return { lifeMetadata: { milestoneType: lifeMilestoneTypeMap[args.life_metadata.milestone_type] ?? LifeMilestoneType.LIFE_MILESTONE_TYPE_UNSPECIFIED, from: args.life_metadata.from ?? "", to: args.life_metadata.to ?? "" } };
  }
  if (args.employment_metadata) {
    return { employmentMetadata: { role: args.employment_metadata.role, companyName: args.employment_metadata.company_name, companyUrl: args.employment_metadata.company_url ?? "", roleDetailsUrl: args.employment_metadata.role_details_url ?? "" } };
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
    return { bookMetadata: { isbn: b.isbn ?? "", title: b.title ?? "", author: b.author ?? "", coverImageUrl: b.cover_image_url ?? "", previewUrl: b.preview_url ?? "", rating: b.rating ?? 0, review: b.review ?? "" } };
  }
  if (args.film_tv_metadata) {
    const f = args.film_tv_metadata;
    return { filmTvMetadata: { tmdbId: f.tmdb_id ?? "", type: f.type === "movie" ? FilmTVType.FILM_TV_TYPE_MOVIE : FilmTVType.FILM_TV_TYPE_TV, posterUrl: f.poster_url ?? "", director: f.director ?? "", network: f.network ?? "", year: f.year ?? 0, seasonsWatched: f.seasons_watched, rating: f.rating ?? 0, review: f.review ?? "" } };
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
