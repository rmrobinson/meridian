package ca.rmrobinson.meridian.data

import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
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
import meridian.v1.TravelMetadata
import meridian.v1.UpdateEventRequest
import meridian.v1.Visibility
import org.json.JSONArray
import org.json.JSONObject

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
        metadataJson = metadataToJson(),
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

    applyMetadataToBuilder(builder, metadataJson)

    return builder.build()
}

// ---------------------------------------------------------------------------
// Private helpers — forward (proto → JSON)
// ---------------------------------------------------------------------------

private fun Event.metadataToJson(): String {
    val obj = JSONObject()
    when {
        hasLifeMetadata() -> with(lifeMetadata) {
            obj.put("type", "life")
            obj.put("milestone_type", milestoneType.name)
            obj.put("from", from)
            obj.put("to", to)
        }
        hasEmploymentMetadata() -> with(employmentMetadata) {
            obj.put("type", "employment")
            obj.put("role", role)
            obj.put("company_name", companyName)
            obj.put("company_url", companyUrl)
        }
        hasEducationMetadata() -> with(educationMetadata) {
            obj.put("type", "education")
            obj.put("institution", institution)
            obj.put("degree", degree)
        }
        hasTravelMetadata() -> with(travelMetadata) {
            obj.put("type", "travel")
            obj.put("countries", JSONArray(countriesList))
            obj.put("cities", JSONArray(citiesList))
        }
        hasFlightMetadata() -> with(flightMetadata) {
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
        hasBookMetadata() -> with(bookMetadata) {
            obj.put("type", "book")
            obj.put("isbn", isbn)
            obj.put("author", author)
            obj.put("title", title)
            obj.put("cover_image_url", coverImageUrl)
            obj.put("preview_url", previewUrl)
            obj.put("rating", rating)
            obj.put("review", review)
        }
        hasFilmTvMetadata() -> with(filmTvMetadata) {
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
        hasConcertMetadata() -> with(concertMetadata) {
            obj.put("type", "concert")
            obj.put("main_act", mainAct)
            obj.put("opening_acts", JSONArray(openingActsList))
            obj.put("playlist_url", playlistUrl)
        }
        hasFitnessMetadata() -> with(fitnessMetadata) {
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
        else -> obj.put("type", "none")
    }
    return obj.toString()
}

// ---------------------------------------------------------------------------
// Private helpers — reverse (JSON → proto, for UpdateEventRequest)
// ---------------------------------------------------------------------------

private fun applyMetadataToBuilder(builder: UpdateEventRequest.Builder, json: String) {
    val obj = try { JSONObject(json) } catch (_: Exception) { return }
    when (obj.optString("type")) {
        "life" -> builder.setLifeMetadata(
            LifeMetadata.newBuilder()
                .setMilestoneType(lifeMilestoneTypeFrom(obj.optString("milestone_type")))
                .setFrom(obj.optString("from"))
                .setTo(obj.optString("to"))
                .build(),
        )
        "employment" -> builder.setEmploymentMetadata(
            EmploymentMetadata.newBuilder()
                .setRole(obj.optString("role"))
                .setCompanyName(obj.optString("company_name"))
                .setCompanyUrl(obj.optString("company_url"))
                .build(),
        )
        "education" -> builder.setEducationMetadata(
            EducationMetadata.newBuilder()
                .setInstitution(obj.optString("institution"))
                .setDegree(obj.optString("degree"))
                .build(),
        )
        "travel" -> builder.setTravelMetadata(
            TravelMetadata.newBuilder()
                .addAllCountries(obj.optJSONArray("countries").toStringList())
                .addAllCities(obj.optJSONArray("cities").toStringList())
                .build(),
        )
        "flight" -> builder.setFlightMetadata(
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
        "book" -> builder.setBookMetadata(
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
        "film_tv" -> builder.setFilmTvMetadata(
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
        "concert" -> builder.setConcertMetadata(
            ConcertMetadata.newBuilder()
                .setMainAct(obj.optString("main_act"))
                .addAllOpeningActs(obj.optJSONArray("opening_acts").toStringList())
                .setPlaylistUrl(obj.optString("playlist_url"))
                .build(),
        )
        "fitness" -> builder.setFitnessMetadata(
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
    }
}

// ---------------------------------------------------------------------------
// Enum reverse-mapping helpers
// ---------------------------------------------------------------------------

private fun visibilityFromString(s: String): Visibility = when (s) {
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
