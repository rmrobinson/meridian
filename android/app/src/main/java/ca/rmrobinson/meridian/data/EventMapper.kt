package ca.rmrobinson.meridian.data

import ca.rmrobinson.meridian.data.healthconnect.HealthActivity
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
import androidx.health.connect.client.records.ExerciseSessionRecord
import meridian.v1.BookMetadata
import meridian.v1.ClimbingType
import meridian.v1.ConcertMetadata
import meridian.v1.EducationMetadata
import meridian.v1.EmploymentMetadata
import meridian.v1.Event
import meridian.v1.EventType
import meridian.v1.FilmTVMetadata
import meridian.v1.FilmTVType
import meridian.v1.FitnessActivity
import meridian.v1.FitnessMetadata
import meridian.v1.FlightMetadata
import meridian.v1.LifeMilestoneType
import meridian.v1.LifeMetadata
import meridian.v1.LineFamilyConfig
import meridian.v1.Location
import meridian.v1.CreateEventRequest
import meridian.v1.TravelMetadata
import meridian.v1.UpdateEventRequest
import meridian.v1.Visibility
import org.json.JSONArray
import org.json.JSONObject
import java.time.ZoneId

// ---------------------------------------------------------------------------
// Neutral metadata container — one subclass per family type.
// Lets us unify proto→JSON and JSON→proto paths regardless of whether the
// source is an Event, a CreateEventRequest, or a stored JSON string.
// ---------------------------------------------------------------------------

private sealed class SerializableMetadata {
    data class Life(val proto: LifeMetadata) : SerializableMetadata()
    data class Employment(val proto: EmploymentMetadata) : SerializableMetadata()
    data class Education(val proto: EducationMetadata) : SerializableMetadata()
    data class Travel(val proto: TravelMetadata) : SerializableMetadata()
    data class Flight(val proto: FlightMetadata) : SerializableMetadata()
    data class Book(val proto: BookMetadata) : SerializableMetadata()
    data class FilmTv(val proto: FilmTVMetadata) : SerializableMetadata()
    data class Concert(val proto: ConcertMetadata) : SerializableMetadata()
    data class Fitness(val proto: FitnessMetadata) : SerializableMetadata()
}

// ---------------------------------------------------------------------------
// Extraction helpers — one per proto source type. Bodies are structurally
// identical; the receiver types differ because proto builders are final.
// ---------------------------------------------------------------------------

private fun Event.extractMetadata(): SerializableMetadata? = when {
    hasLifeMetadata()       -> SerializableMetadata.Life(lifeMetadata)
    hasEmploymentMetadata() -> SerializableMetadata.Employment(employmentMetadata)
    hasEducationMetadata()  -> SerializableMetadata.Education(educationMetadata)
    hasTravelMetadata()     -> SerializableMetadata.Travel(travelMetadata)
    hasFlightMetadata()     -> SerializableMetadata.Flight(flightMetadata)
    hasBookMetadata()       -> SerializableMetadata.Book(bookMetadata)
    hasFilmTvMetadata()     -> SerializableMetadata.FilmTv(filmTvMetadata)
    hasConcertMetadata()    -> SerializableMetadata.Concert(concertMetadata)
    hasFitnessMetadata()    -> SerializableMetadata.Fitness(fitnessMetadata)
    else                    -> null
}

private fun CreateEventRequest.extractMetadata(): SerializableMetadata? = when {
    hasLifeMetadata()       -> SerializableMetadata.Life(lifeMetadata)
    hasEmploymentMetadata() -> SerializableMetadata.Employment(employmentMetadata)
    hasEducationMetadata()  -> SerializableMetadata.Education(educationMetadata)
    hasTravelMetadata()     -> SerializableMetadata.Travel(travelMetadata)
    hasFlightMetadata()     -> SerializableMetadata.Flight(flightMetadata)
    hasBookMetadata()       -> SerializableMetadata.Book(bookMetadata)
    hasFilmTvMetadata()     -> SerializableMetadata.FilmTv(filmTvMetadata)
    hasConcertMetadata()    -> SerializableMetadata.Concert(concertMetadata)
    hasFitnessMetadata()    -> SerializableMetadata.Fitness(fitnessMetadata)
    else                    -> null
}

// ---------------------------------------------------------------------------
// Proto → JSON  (single authoritative serializer)
// ---------------------------------------------------------------------------

private fun SerializableMetadata?.toJson(): String {
    val obj = JSONObject()
    when (this) {
        null -> obj.put("type", "none")
        is SerializableMetadata.Life -> with(proto) {
            obj.put("type", "life")
            obj.put("milestone_type", milestoneType.name)
            obj.put("from", from)
            obj.put("to", to)
        }
        is SerializableMetadata.Employment -> with(proto) {
            obj.put("type", "employment")
            obj.put("role", role)
            obj.put("company_name", companyName)
            obj.put("company_url", companyUrl)
        }
        is SerializableMetadata.Education -> with(proto) {
            obj.put("type", "education")
            obj.put("institution", institution)
            obj.put("degree", degree)
        }
        is SerializableMetadata.Travel -> with(proto) {
            obj.put("type", "travel")
            obj.put("countries", JSONArray(countriesList))
            obj.put("cities", JSONArray(citiesList))
        }
        is SerializableMetadata.Flight -> with(proto) {
            obj.put("type", "flight")
            obj.put("airline", airline)
            obj.put("flight_number", flightNumber)
            obj.put("aircraft_type", aircraftType)
            obj.put("tail_number", tailNumber)
            obj.put("origin_iata", originIata)
            obj.put("destination_iata", destinationIata)
            obj.put("scheduled_departure", scheduledDeparture)
            obj.put("scheduled_arrival", scheduledArrival)
            obj.put("actual_departure", actualDeparture)
            obj.put("actual_arrival", actualArrival)
        }
        is SerializableMetadata.Book -> with(proto) {
            obj.put("type", "book")
            obj.put("isbn", isbn)
            obj.put("author", author)
            obj.put("title", title)
            obj.put("cover_image_url", coverImageUrl)
            obj.put("preview_url", previewUrl)
            obj.put("rating", rating)
            obj.put("review", review)
        }
        is SerializableMetadata.FilmTv -> with(proto) {
            obj.put("type", "film_tv")
            obj.put("tmdb_id", tmdbId)
            obj.put("film_tv_type", type.name)
            obj.put("poster_url", posterUrl)
            obj.put("director", director)
            obj.put("network", network)
            obj.put("year", year)
            obj.put("rating", rating)
            obj.put("review", review)
            if (hasSeasonsWatched()) obj.put("seasons_watched", seasonsWatched)
        }
        is SerializableMetadata.Concert -> with(proto) {
            obj.put("type", "concert")
            obj.put("main_act", mainAct)
            obj.put("opening_acts", JSONArray(openingActsList))
            obj.put("playlist_url", playlistUrl)
        }
        is SerializableMetadata.Fitness -> with(proto) {
            obj.put("type", "fitness")
            obj.put("activity", activity.name)
            obj.put("duration", duration)
            obj.put("garmin_activity_url", garminActivityUrl)
            if (hasDistanceKm()) obj.put("distance_km", distanceKm)
            if (hasElevationGainM()) obj.put("elevation_gain_m", elevationGainM)
            if (hasAvgHeartRate()) obj.put("avg_heart_rate", avgHeartRate)
            if (hasAvgPaceMinKm()) obj.put("avg_pace_min_km", avgPaceMinKm)
            if (bike.isNotBlank()) obj.put("bike", bike)
            if (hasAvgSpeedKmh()) obj.put("avg_speed_kmh", avgSpeedKmh)
            if (trailName.isNotBlank()) obj.put("trail_name", trailName)
            if (alltrailsUrl.isNotBlank()) obj.put("alltrails_url", alltrailsUrl)
            if (resort.isNotBlank()) obj.put("resort", resort)
            if (hasVerticalDropM()) obj.put("vertical_drop_m", verticalDropM)
            if (hasRuns()) obj.put("runs", runs)
            if (diveSite.isNotBlank()) obj.put("dive_site", diveSite)
            if (hasMaxDepthM()) obj.put("max_depth_m", maxDepthM)
            if (hasAvgDepthM()) obj.put("avg_depth_m", avgDepthM)
            if (climbingType != ClimbingType.CLIMBING_TYPE_UNSPECIFIED) obj.put("climbing_type", climbingType.name)
            if (routeName.isNotBlank()) obj.put("route_name", routeName)
            if (problemName.isNotBlank()) obj.put("problem_name", problemName)
            if (grade.isNotBlank()) obj.put("grade", grade)
            if (courseName.isNotBlank()) obj.put("course_name", courseName)
            if (hasHoles()) obj.put("holes", holes)
            if (hasScore()) obj.put("score", score)
            if (opponent.isNotBlank()) obj.put("opponent", opponent)
            if (result.isNotBlank()) obj.put("result", result)
        }
    }
    return obj.toString()
}

// ---------------------------------------------------------------------------
// JSON → proto  (single authoritative deserializer)
// ---------------------------------------------------------------------------

private fun parseMetadataFromJson(json: String): SerializableMetadata? {
    val obj = try { JSONObject(json) } catch (_: Exception) { return null }
    return when (obj.optString("type")) {
        "life" -> SerializableMetadata.Life(
            LifeMetadata.newBuilder()
                .setMilestoneType(lifeMilestoneTypeFrom(obj.optString("milestone_type")))
                .setFrom(obj.optString("from"))
                .setTo(obj.optString("to"))
                .build(),
        )
        "employment" -> SerializableMetadata.Employment(
            EmploymentMetadata.newBuilder()
                .setRole(obj.optString("role"))
                .setCompanyName(obj.optString("company_name"))
                .setCompanyUrl(obj.optString("company_url"))
                .build(),
        )
        "education" -> SerializableMetadata.Education(
            EducationMetadata.newBuilder()
                .setInstitution(obj.optString("institution"))
                .setDegree(obj.optString("degree"))
                .build(),
        )
        "travel" -> SerializableMetadata.Travel(
            TravelMetadata.newBuilder()
                .addAllCountries(obj.optJSONArray("countries").toStringList())
                .addAllCities(obj.optJSONArray("cities").toStringList())
                .build(),
        )
        "flight" -> SerializableMetadata.Flight(
            FlightMetadata.newBuilder()
                .setAirline(obj.optString("airline"))
                .setFlightNumber(obj.optString("flight_number"))
                .setAircraftType(obj.optString("aircraft_type"))
                .setTailNumber(obj.optString("tail_number"))
                .setOriginIata(obj.optString("origin_iata"))
                .setDestinationIata(obj.optString("destination_iata"))
                .setScheduledDeparture(obj.optString("scheduled_departure"))
                .setScheduledArrival(obj.optString("scheduled_arrival"))
                .setActualDeparture(obj.optString("actual_departure"))
                .setActualArrival(obj.optString("actual_arrival"))
                .build(),
        )
        "book" -> SerializableMetadata.Book(
            BookMetadata.newBuilder()
                .setIsbn(obj.optString("isbn"))
                .setAuthor(obj.optString("author"))
                .setTitle(obj.optString("title"))
                .setCoverImageUrl(obj.optString("cover_image_url"))
                .setPreviewUrl(obj.optString("preview_url"))
                .setRating(obj.optInt("rating"))
                .setReview(obj.optString("review"))
                .build(),
        )
        "film_tv" -> SerializableMetadata.FilmTv(
            FilmTVMetadata.newBuilder()
                .setTmdbId(obj.optString("tmdb_id"))
                .setType(filmTvTypeFrom(obj.optString("film_tv_type")))
                .setPosterUrl(obj.optString("poster_url"))
                .setDirector(obj.optString("director"))
                .setNetwork(obj.optString("network"))
                .setYear(obj.optInt("year"))
                .setRating(obj.optInt("rating"))
                .setReview(obj.optString("review"))
                .also { b -> if (obj.has("seasons_watched")) b.setSeasonsWatched(obj.getInt("seasons_watched")) }
                .build(),
        )
        "concert" -> SerializableMetadata.Concert(
            ConcertMetadata.newBuilder()
                .setMainAct(obj.optString("main_act"))
                .addAllOpeningActs(obj.optJSONArray("opening_acts").toStringList())
                .setPlaylistUrl(obj.optString("playlist_url"))
                .build(),
        )
        "fitness" -> SerializableMetadata.Fitness(
            FitnessMetadata.newBuilder()
                .setActivity(fitnessActivityFrom(obj.optString("activity")))
                .setDuration(obj.optString("duration"))
                .setGarminActivityUrl(obj.optString("garmin_activity_url"))
                .also { b -> if (obj.has("distance_km")) b.setDistanceKm(obj.getDouble("distance_km")) }
                .also { b -> if (obj.has("elevation_gain_m")) b.setElevationGainM(obj.getInt("elevation_gain_m")) }
                .also { b -> if (obj.has("avg_heart_rate")) b.setAvgHeartRate(obj.getInt("avg_heart_rate")) }
                .also { b -> if (obj.has("avg_pace_min_km")) b.setAvgPaceMinKm(obj.getDouble("avg_pace_min_km")) }
                .also { b -> if (obj.has("bike")) b.setBike(obj.getString("bike")) }
                .also { b -> if (obj.has("avg_speed_kmh")) b.setAvgSpeedKmh(obj.getDouble("avg_speed_kmh")) }
                .also { b -> if (obj.has("trail_name")) b.setTrailName(obj.getString("trail_name")) }
                .also { b -> if (obj.has("alltrails_url")) b.setAlltrailsUrl(obj.getString("alltrails_url")) }
                .also { b -> if (obj.has("resort")) b.setResort(obj.getString("resort")) }
                .also { b -> if (obj.has("vertical_drop_m")) b.setVerticalDropM(obj.getInt("vertical_drop_m")) }
                .also { b -> if (obj.has("runs")) b.setRuns(obj.getInt("runs")) }
                .also { b -> if (obj.has("dive_site")) b.setDiveSite(obj.getString("dive_site")) }
                .also { b -> if (obj.has("max_depth_m")) b.setMaxDepthM(obj.getDouble("max_depth_m")) }
                .also { b -> if (obj.has("avg_depth_m")) b.setAvgDepthM(obj.getDouble("avg_depth_m")) }
                .setClimbingType(climbingTypeFrom(obj.optString("climbing_type")))
                .also { b -> if (obj.has("route_name")) b.setRouteName(obj.getString("route_name")) }
                .also { b -> if (obj.has("problem_name")) b.setProblemName(obj.getString("problem_name")) }
                .also { b -> if (obj.has("grade")) b.setGrade(obj.getString("grade")) }
                .also { b -> if (obj.has("course_name")) b.setCourseName(obj.getString("course_name")) }
                .also { b -> if (obj.has("holes")) b.setHoles(obj.getInt("holes")) }
                .also { b -> if (obj.has("score")) b.setScore(obj.getInt("score")) }
                .also { b -> if (obj.has("opponent")) b.setOpponent(obj.getString("opponent")) }
                .also { b -> if (obj.has("result")) b.setResult(obj.getString("result")) }
                .build(),
        )
        else -> null
    }
}

// ---------------------------------------------------------------------------
// Apply helpers — one per builder type. Bodies are a flat when() switch;
// the heavy JSON parsing lives in parseMetadataFromJson() above.
// ---------------------------------------------------------------------------

private fun SerializableMetadata?.applyTo(builder: UpdateEventRequest.Builder) {
    when (this) {
        null                            -> Unit
        is SerializableMetadata.Life        -> builder.setLifeMetadata(proto)
        is SerializableMetadata.Employment  -> builder.setEmploymentMetadata(proto)
        is SerializableMetadata.Education   -> builder.setEducationMetadata(proto)
        is SerializableMetadata.Travel      -> builder.setTravelMetadata(proto)
        is SerializableMetadata.Flight      -> builder.setFlightMetadata(proto)
        is SerializableMetadata.Book        -> builder.setBookMetadata(proto)
        is SerializableMetadata.FilmTv      -> builder.setFilmTvMetadata(proto)
        is SerializableMetadata.Concert     -> builder.setConcertMetadata(proto)
        is SerializableMetadata.Fitness     -> builder.setFitnessMetadata(proto)
    }
}

private fun SerializableMetadata?.applyTo(builder: CreateEventRequest.Builder) {
    when (this) {
        null                            -> Unit
        is SerializableMetadata.Life        -> builder.setLifeMetadata(proto)
        is SerializableMetadata.Employment  -> builder.setEmploymentMetadata(proto)
        is SerializableMetadata.Education   -> builder.setEducationMetadata(proto)
        is SerializableMetadata.Travel      -> builder.setTravelMetadata(proto)
        is SerializableMetadata.Flight      -> builder.setFlightMetadata(proto)
        is SerializableMetadata.Book        -> builder.setBookMetadata(proto)
        is SerializableMetadata.FilmTv      -> builder.setFilmTvMetadata(proto)
        is SerializableMetadata.Concert     -> builder.setConcertMetadata(proto)
        is SerializableMetadata.Fitness     -> builder.setFitnessMetadata(proto)
    }
}

// ---------------------------------------------------------------------------
// LineFamilyConfig → LineFamilyEntity
// ---------------------------------------------------------------------------

fun LineFamilyConfig.toEntity(): LineFamilyEntity {
    val h = if (baseColorHslCount > 0) getBaseColorHsl(0) else 0
    val s = if (baseColorHslCount > 1) getBaseColorHsl(1) else 0
    val l = if (baseColorHslCount > 2) getBaseColorHsl(2) else 50
    return LineFamilyEntity(
        id = id,
        label = label,
        baseColorH = h,
        baseColorS = s,
        baseColorL = l,
        side = side.name,
        onEnd = onEnd.name,
        spawnBehavior = spawnBehavior.name,
    )
}

// ---------------------------------------------------------------------------
// Event → EventEntity
// ---------------------------------------------------------------------------

fun Event.toEntity(now: Long = System.currentTimeMillis()): EventEntity =
    EventEntity(
        id = id,
        familyId = familyId,
        lineKey = lineKey,
        type = if (type == EventType.EVENT_TYPE_SPAN) "span" else "point",
        title = title,
        startDate = startDate.takeIf { it.isNotBlank() },
        endDate = endDate.takeIf { it.isNotBlank() },
        date = date.takeIf { it.isNotBlank() },
        locationLabel = if (hasLocation()) location.label.takeIf { it.isNotBlank() } else null,
        locationLat = if (hasLocation()) location.lat else null,
        locationLng = if (hasLocation()) location.lng else null,
        description = description.takeIf { it.isNotBlank() },
        externalUrl = externalUrl.takeIf { it.isNotBlank() },
        heroImageUrl = heroImageUrl.takeIf { it.isNotBlank() },
        metadataJson = extractMetadata().toJson(),
        visibility = visibility.name,
        syncState = SyncState.SYNCED,
        createdAt = now,
        updatedAt = now,
    )

// ---------------------------------------------------------------------------
// EventEntity → UpdateEventRequest (full round-trip for safe server updates)
// ---------------------------------------------------------------------------

fun EventEntity.toUpdateRequest(newEndDate: String? = null): UpdateEventRequest {
    val builder = UpdateEventRequest.newBuilder()
        .setId(id)
        .setFamilyId(familyId)
        .setLineKey(lineKey)
        .setType(if (type == "span") EventType.EVENT_TYPE_SPAN else EventType.EVENT_TYPE_POINT)
        .setTitle(title)
        .setVisibility(visibilityFromString(visibility))

    startDate?.let { builder.setStartDate(it) }
    (newEndDate ?: endDate)?.let { builder.setEndDate(it) }
    description?.let { builder.setDescription(it) }
    externalUrl?.let { builder.setExternalUrl(it) }
    heroImageUrl?.let { builder.setHeroImageUrl(it) }

    if (locationLabel != null || locationLat != null) {
        builder.setLocation(
            Location.newBuilder()
                .setLabel(locationLabel ?: "")
                .setLat(locationLat ?: 0.0)
                .setLng(locationLng ?: 0.0)
                .build(),
        )
    }

    parseMetadataFromJson(metadataJson).applyTo(builder)

    return builder.build()
}

// ---------------------------------------------------------------------------
// CreateEventRequest → EventEntity (for LOCAL_ONLY placeholder before RPC confirms)
// ---------------------------------------------------------------------------

fun CreateEventRequest.toLocalEntity(localId: String, now: Long): EventEntity = EventEntity(
    id = localId,
    familyId = familyId,
    lineKey = lineKey,
    type = if (type == EventType.EVENT_TYPE_SPAN) "span" else "point",
    title = title,
    startDate = startDate.takeIf { it.isNotBlank() },
    endDate = endDate.takeIf { it.isNotBlank() },
    date = date.takeIf { it.isNotBlank() },
    locationLabel = if (hasLocation()) location.label.takeIf { it.isNotBlank() } else null,
    locationLat = if (hasLocation()) location.lat else null,
    locationLng = if (hasLocation()) location.lng else null,
    description = description.takeIf { it.isNotBlank() },
    externalUrl = externalUrl.takeIf { it.isNotBlank() },
    heroImageUrl = heroImageUrl.takeIf { it.isNotBlank() },
    metadataJson = extractMetadata().toJson(),
    visibility = visibility.name,
    syncState = SyncState.LOCAL_ONLY,
    createdAt = now,
    updatedAt = now,
)

// ---------------------------------------------------------------------------
// EventEntity → CreateEventRequest (for LOCAL_ONLY retry via SyncEventsUseCase)
// ---------------------------------------------------------------------------

fun EventEntity.toCreateRequest(): CreateEventRequest {
    val builder = CreateEventRequest.newBuilder()
        .setFamilyId(familyId)
        .setLineKey(lineKey)
        .setType(if (type == "span") EventType.EVENT_TYPE_SPAN else EventType.EVENT_TYPE_POINT)
        .setTitle(title)
        .setVisibility(visibilityFromString(visibility))

    startDate?.let { builder.setStartDate(it) }
    endDate?.let { builder.setEndDate(it) }
    date?.let { builder.setDate(it) }
    description?.let { builder.setDescription(it) }
    externalUrl?.let { builder.setExternalUrl(it) }
    heroImageUrl?.let { builder.setHeroImageUrl(it) }

    if (locationLabel != null || locationLat != null) {
        builder.setLocation(
            Location.newBuilder()
                .setLabel(locationLabel ?: "")
                .setLat(locationLat ?: 0.0)
                .setLng(locationLng ?: 0.0)
                .build(),
        )
    }

    parseMetadataFromJson(metadataJson).applyTo(builder)
    return builder.build()
}

// ---------------------------------------------------------------------------
// Enum reverse-mapping helpers
// ---------------------------------------------------------------------------

internal fun visibilityFromString(s: String): Visibility = when (s) {
    "VISIBILITY_PUBLIC"   -> Visibility.VISIBILITY_PUBLIC
    "VISIBILITY_FRIENDS"  -> Visibility.VISIBILITY_FRIENDS
    "VISIBILITY_FAMILY"   -> Visibility.VISIBILITY_FAMILY
    "VISIBILITY_PERSONAL" -> Visibility.VISIBILITY_PERSONAL
    else                  -> Visibility.VISIBILITY_PERSONAL
}

private fun lifeMilestoneTypeFrom(s: String): LifeMilestoneType = when (s) {
    "LIFE_MILESTONE_TYPE_BIRTH"       -> LifeMilestoneType.LIFE_MILESTONE_TYPE_BIRTH
    "LIFE_MILESTONE_TYPE_DEATH"       -> LifeMilestoneType.LIFE_MILESTONE_TYPE_DEATH
    "LIFE_MILESTONE_TYPE_MARRIAGE"    -> LifeMilestoneType.LIFE_MILESTONE_TYPE_MARRIAGE
    "LIFE_MILESTONE_TYPE_RELOCATION"  -> LifeMilestoneType.LIFE_MILESTONE_TYPE_RELOCATION
    "LIFE_MILESTONE_TYPE_GRADUATION"  -> LifeMilestoneType.LIFE_MILESTONE_TYPE_GRADUATION
    "LIFE_MILESTONE_TYPE_ANNIVERSARY" -> LifeMilestoneType.LIFE_MILESTONE_TYPE_ANNIVERSARY
    else                              -> LifeMilestoneType.LIFE_MILESTONE_TYPE_UNSPECIFIED
}

private fun filmTvTypeFrom(s: String): FilmTVType = when (s) {
    "FILM_TV_TYPE_MOVIE" -> FilmTVType.FILM_TV_TYPE_MOVIE
    "FILM_TV_TYPE_TV"    -> FilmTVType.FILM_TV_TYPE_TV
    else                 -> FilmTVType.FILM_TV_TYPE_UNSPECIFIED
}

private fun fitnessActivityFrom(s: String): FitnessActivity = when (s) {
    "FITNESS_ACTIVITY_RUN"    -> FitnessActivity.FITNESS_ACTIVITY_RUN
    "FITNESS_ACTIVITY_CYCLE"  -> FitnessActivity.FITNESS_ACTIVITY_CYCLE
    "FITNESS_ACTIVITY_HIKE"   -> FitnessActivity.FITNESS_ACTIVITY_HIKE
    "FITNESS_ACTIVITY_SKI"    -> FitnessActivity.FITNESS_ACTIVITY_SKI
    "FITNESS_ACTIVITY_SCUBA"  -> FitnessActivity.FITNESS_ACTIVITY_SCUBA
    "FITNESS_ACTIVITY_CLIMB"  -> FitnessActivity.FITNESS_ACTIVITY_CLIMB
    "FITNESS_ACTIVITY_GOLF"   -> FitnessActivity.FITNESS_ACTIVITY_GOLF
    "FITNESS_ACTIVITY_SQUASH" -> FitnessActivity.FITNESS_ACTIVITY_SQUASH
    else                      -> FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED
}

private fun climbingTypeFrom(s: String): ClimbingType = when (s) {
    "CLIMBING_TYPE_SPORT"      -> ClimbingType.CLIMBING_TYPE_SPORT
    "CLIMBING_TYPE_BOULDERING" -> ClimbingType.CLIMBING_TYPE_BOULDERING
    "CLIMBING_TYPE_GYM"        -> ClimbingType.CLIMBING_TYPE_GYM
    else                       -> ClimbingType.CLIMBING_TYPE_UNSPECIFIED
}

private fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return (0 until length()).map { getString(it) }
}

// ---------------------------------------------------------------------------
// Health Connect → EventEntity / CreateEventRequest
// ---------------------------------------------------------------------------

/**
 * Maps a raw Health Connect exercise type int to the closest Meridian FitnessActivity enum.
 * Types without a direct mapping fall back to UNSPECIFIED.
 */
fun healthExerciseTypeToFitnessActivity(exerciseType: Int): FitnessActivity = when (exerciseType) {
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> FitnessActivity.FITNESS_ACTIVITY_RUN

    ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
    ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> FitnessActivity.FITNESS_ACTIVITY_CYCLE

    ExerciseSessionRecord.EXERCISE_TYPE_HIKING            -> FitnessActivity.FITNESS_ACTIVITY_HIKE

    ExerciseSessionRecord.EXERCISE_TYPE_SKIING,
    ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING       -> FitnessActivity.FITNESS_ACTIVITY_SKI

    ExerciseSessionRecord.EXERCISE_TYPE_SCUBA_DIVING       -> FitnessActivity.FITNESS_ACTIVITY_SCUBA

    ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING      -> FitnessActivity.FITNESS_ACTIVITY_CLIMB

    ExerciseSessionRecord.EXERCISE_TYPE_GOLF               -> FitnessActivity.FITNESS_ACTIVITY_GOLF

    ExerciseSessionRecord.EXERCISE_TYPE_SQUASH             -> FitnessActivity.FITNESS_ACTIVITY_SQUASH

    ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER,
    ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL      -> FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED

    ExerciseSessionRecord.EXERCISE_TYPE_WALKING            -> FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED

    else                                                   -> FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED
}

/** Builds the metadataJson for a Health Connect activity, including hc_id + source. */
private fun HealthActivity.buildHcMetadataJson(fitnessActivity: FitnessActivity): String {
    val meta = FitnessMetadata.newBuilder()
        .setActivity(fitnessActivity)
        .apply { distanceMeters?.let { setDistanceKm(it / 1000.0) } }
        .apply { elevationGainedMeters?.let { setElevationGainM(it.toInt()) } }
        .build()
    val obj = JSONObject(SerializableMetadata.Fitness(meta).toJson())
    obj.put("hc_id", healthConnectId)
    obj.put("source", sourcePackageName ?: "health_connect")
    return obj.toString()
}

/**
 * Derives the title for a Health Connect activity.
 * Uses the source-provided title if present; falls back to "{ActivityLabel} on {date}".
 */
fun HealthActivity.derivedTitle(fitnessActivity: FitnessActivity): String {
    if (!title.isNullOrBlank()) return title
    val dateLabel = startTime.atZone(ZoneId.systemDefault()).toLocalDate().toString()
    val activityLabel = when (fitnessActivity) {
        FitnessActivity.FITNESS_ACTIVITY_RUN    -> "Run"
        FitnessActivity.FITNESS_ACTIVITY_CYCLE  -> "Cycle"
        FitnessActivity.FITNESS_ACTIVITY_HIKE   -> "Hike"
        FitnessActivity.FITNESS_ACTIVITY_SKI    -> "Ski"
        FitnessActivity.FITNESS_ACTIVITY_SCUBA  -> "Scuba"
        FitnessActivity.FITNESS_ACTIVITY_CLIMB  -> "Climb"
        FitnessActivity.FITNESS_ACTIVITY_GOLF   -> "Golf"
        FitnessActivity.FITNESS_ACTIVITY_SQUASH -> "Squash"
        else                                    -> "Activity"
    }
    return "$activityLabel on $dateLabel"
}

/**
 * Builds a [CreateEventRequest] for sending to the gRPC server.
 * The `hc_id` is not included in the proto — it is stored in the local Room entity only.
 */
fun HealthActivity.toCreateRequest(fitnessActivity: FitnessActivity): CreateEventRequest {
    val zone = ZoneId.systemDefault()
    val start = startTime.atZone(zone).toLocalDate()
    val end = endTime.atZone(zone).toLocalDate()
    val isPoint = start == end

    val meta = FitnessMetadata.newBuilder()
        .setActivity(fitnessActivity)
        .apply { distanceMeters?.let { setDistanceKm(it / 1000.0) } }
        .apply { elevationGainedMeters?.let { setElevationGainM(it.toInt()) } }
        .build()

    val builder = CreateEventRequest.newBuilder()
        .setFamilyId("fitness")
        .setLineKey("fitness")
        .setTitle(derivedTitle(fitnessActivity))
        .setVisibility(Visibility.VISIBILITY_PUBLIC)
        .setFitnessMetadata(meta)

    if (isPoint) {
        builder.setType(EventType.EVENT_TYPE_POINT).setDate(start.toString())
    } else {
        builder.setType(EventType.EVENT_TYPE_SPAN)
            .setStartDate(start.toString())
            .setEndDate(end.toString())
    }

    return builder.build()
}

/**
 * Builds a LOCAL_ONLY [EventEntity] for a Health Connect activity.
 * Unlike `CreateEventRequest.toLocalEntity()`, this includes `hc_id` and `source`
 * in the metadataJson so Room-side deduplication works correctly.
 */
fun HealthActivity.toLocalEntity(localId: String, now: Long): EventEntity {
    val fitnessActivity = healthExerciseTypeToFitnessActivity(exerciseType)
    val zone = ZoneId.systemDefault()
    val start = startTime.atZone(zone).toLocalDate()
    val end = endTime.atZone(zone).toLocalDate()
    val isPoint = start == end

    return EventEntity(
        id = localId,
        familyId = "fitness",
        lineKey = "fitness",
        type = if (isPoint) "point" else "span",
        title = derivedTitle(fitnessActivity),
        startDate = if (!isPoint) start.toString() else null,
        endDate = if (!isPoint) end.toString() else null,
        date = if (isPoint) start.toString() else null,
        locationLabel = null,
        locationLat = null,
        locationLng = null,
        description = null,
        externalUrl = null,
        heroImageUrl = null,
        metadataJson = buildHcMetadataJson(fitnessActivity),
        visibility = Visibility.VISIBILITY_PUBLIC.name,
        syncState = SyncState.LOCAL_ONLY,
        createdAt = now,
        updatedAt = now,
    )
}

/**
 * Patches Health Connect fields (hc_id, source, distance, elevation) into an existing
 * fitness event's metadataJson, preserving all other existing fields. Used by the MERGE flow.
 */
fun patchHcFieldsIntoMetadataJson(
    existingJson: String,
    activity: HealthActivity,
): String {
    val obj = try { JSONObject(existingJson) } catch (_: Exception) { JSONObject() }
    obj.put("hc_id", activity.healthConnectId)
    obj.put("source", activity.sourcePackageName ?: "health_connect")
    activity.distanceMeters?.let {
        if (!obj.has("distance_km") || obj.getDouble("distance_km") == 0.0) {
            obj.put("distance_km", it / 1000.0)
        }
    }
    activity.elevationGainedMeters?.let {
        if (!obj.has("elevation_gain_m") || obj.getInt("elevation_gain_m") == 0) {
            obj.put("elevation_gain_m", it.toInt())
        }
    }
    return obj.toString()
}
