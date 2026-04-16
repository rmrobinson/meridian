package ca.rmrobinson.meridian.data

import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
import meridian.v1.Event
import meridian.v1.EventType
import meridian.v1.LineFamilyConfig
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
        syncState = SyncState.SYNCED,
        createdAt = now,
        updatedAt = now,
    )

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
            obj.put("countries", countriesList.joinToString(","))
            obj.put("cities", citiesList.joinToString(","))
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
            obj.put("opening_acts", openingActsList.joinToString(","))
            obj.put("playlist_url", playlistUrl)
        }
        hasFitnessMetadata() -> with(fitnessMetadata) {
            obj.put("type", "fitness")
            obj.put("activity", activity.name)
            obj.put("duration", duration)
            if (hasDistanceKm()) obj.put("distance_km", distanceKm)
            if (hasElevationGainM()) obj.put("elevation_gain_m", elevationGainM)
            if (hasAvgHeartRate()) obj.put("avg_heart_rate", avgHeartRate)
            obj.put("garmin_activity_url", garminActivityUrl)
        }
        else -> obj.put("type", "none")
    }
    return obj.toString()
}
