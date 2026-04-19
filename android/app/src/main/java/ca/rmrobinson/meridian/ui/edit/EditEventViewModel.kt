package ca.rmrobinson.meridian.ui.edit

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.toUpdateRequest
import ca.rmrobinson.meridian.data.visibilityFromString
import ca.rmrobinson.meridian.domain.usecase.SyncEventsUseCase
import ca.rmrobinson.meridian.domain.usecase.UpdateEventUseCase
import android.util.Log
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import meridian.v1.ClimbingType
import meridian.v1.FilmTVType
import meridian.v1.FitnessActivity
import meridian.v1.FitnessMetadata
import meridian.v1.Visibility
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class EditEventViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: EventRepository,
    private val syncEventsUseCase: SyncEventsUseCase,
    private val updateEventUseCase: UpdateEventUseCase,
) : ViewModel() {

    private val eventId: String = checkNotNull(savedStateHandle["eventId"])
    private var _entity: EventEntity? = null

    data class UiState(
        val isLoading: Boolean = true,
        val notFound: Boolean = false,
        // Context header (read-only display)
        val familyId: String = "",
        val lineKey: String = "",
        val eventType: String = "",      // "span" or "point"
        val metadataType: String = "",   // "book", "film_tv", "flight", "life", etc.
        val filmTvSubtype: String = "",  // "FILM_TV_TYPE_MOVIE" or "FILM_TV_TYPE_TV"
        val createdAt: Long = 0L,
        // Common editable
        val title: String = "",
        val description: String = "",
        // Date fields — populated based on the original entity's date usage
        val date: LocalDate? = null,         // set if entity.date != null (true point events)
        val startDate: LocalDate? = null,    // set if entity.startDate != null (spans + some points)
        val endDate: LocalDate? = null,      // set if entity.endDate != null (spans)
        // Book metadata
        val isbn: String = "",
        // Film/TV metadata
        val year: String = "",
        val director: String = "",
        val network: String = "",
        val seasonsWatched: String = "",
        val rating: Int = 0,
        val review: String = "",
        // Flight metadata
        val airline: String = "",
        val flightNumber: String = "",
        val originIata: String = "",
        val destinationIata: String = "",
        val scheduledDeparture: LocalTime? = null,
        val actualDeparture: LocalTime? = null,
        val actualArrival: LocalTime? = null,
        // Fitness metadata
        val fitnessActivity: FitnessActivity = FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED,
        val duration: String = "",
        val distanceKm: String = "",
        val elevationGainM: String = "",
        val avgHeartRate: String = "",
        val garminUrl: String = "",
        val avgPaceMinKm: String = "",
        val bike: String = "",
        val avgSpeedKmh: String = "",
        val trailName: String = "",
        val alltrailsUrl: String = "",
        val resort: String = "",
        val verticalDropM: String = "",
        val runs: String = "",
        val diveSite: String = "",
        val maxDepthM: String = "",
        val avgDepthM: String = "",
        val climbingType: ClimbingType = ClimbingType.CLIMBING_TYPE_UNSPECIFIED,
        val routeName: String = "",
        val problemName: String = "",
        val grade: String = "",
        val courseName: String = "",
        val holes: String = "",
        val score: String = "",
        val opponent: String = "",
        val result: String = "",
        // Visibility
        val visibility: Visibility = Visibility.VISIBILITY_PERSONAL,
        // Submission
        val isSubmitting: Boolean = false,
        val error: String? = null,
        val isSuccess: Boolean = false,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            // Sync first so the form is always populated with server-enriched data
            // (e.g. book author, TMDB year/director). Failure is non-fatal — we fall
            // back to whatever is in Room.
            try { syncEventsUseCase() } catch (e: Exception) {
                Log.w(TAG, "sync before edit failed, using cached entity", e)
            }

            val entity = repository.getEvent(eventId)
            if (entity == null) {
                _uiState.update { it.copy(isLoading = false, notFound = true) }
                return@launch
            }
            Log.d(TAG, "populateFromEntity id=$eventId metadataJson=${entity.metadataJson}")
            _entity = entity
            populateFromEntity(entity)
        }
    }

    private fun populateFromEntity(entity: EventEntity) {
        val json = try { JSONObject(entity.metadataJson) } catch (_: Exception) { JSONObject() }
        val metadataType = json.optString("type", "none")
        val filmTvSubtype = if (metadataType == "film_tv") json.optString("film_tv_type") else ""

        val date = entity.date?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val startDate = entity.startDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val endDate = entity.endDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

        val visibility = visibilityFromString(entity.visibility)

        _uiState.update {
            UiState(
                isLoading = false,
                familyId = entity.familyId,
                lineKey = entity.lineKey,
                eventType = entity.type,
                metadataType = metadataType,
                filmTvSubtype = filmTvSubtype,
                createdAt = entity.createdAt,
                title = entity.title.ifBlank {
                    // Enricher may have filled in the title inside metadata (e.g. book ISBN lookup)
                    // while leaving the top-level event title empty if none was provided at creation.
                    if (metadataType == "book") json.optString("title", "") else ""
                },
                description = entity.description ?: "",
                date = date,
                startDate = startDate,
                endDate = endDate,
                isbn = if (metadataType == "book") json.optString("isbn") else "",
                year = if (metadataType == "film_tv") {
                    val y = json.optInt("year")
                    if (y > 0) y.toString() else ""
                } else "",
                director = if (metadataType == "film_tv") json.optString("director") else "",
                network = if (metadataType == "film_tv") json.optString("network") else "",
                seasonsWatched = if (metadataType == "film_tv" && json.has("seasons_watched"))
                    json.getInt("seasons_watched").toString() else "",
                rating = if (metadataType == "book" || metadataType == "film_tv")
                    json.optInt("rating") else 0,
                review = if (metadataType == "book" || metadataType == "film_tv")
                    json.optString("review") else "",
                airline = if (metadataType == "flight") json.optString("airline") else "",
                flightNumber = if (metadataType == "flight") json.optString("flight_number") else "",
                originIata = if (metadataType == "flight") json.optString("origin_iata") else "",
                destinationIata = if (metadataType == "flight") json.optString("destination_iata") else "",
                scheduledDeparture = if (metadataType == "flight") parseFlightTime(json.optString("scheduled_departure")) else null,
                actualDeparture = if (metadataType == "flight") parseFlightTime(json.optString("actual_departure")) else null,
                actualArrival = if (metadataType == "flight") parseFlightTime(json.optString("actual_arrival")) else null,
                fitnessActivity = if (metadataType == "fitness") fitnessActivityFromName(json.optString("activity")) else FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED,
                duration = if (metadataType == "fitness") json.optString("duration") else "",
                distanceKm = if (metadataType == "fitness" && json.has("distance_km")) json.getDouble("distance_km").toString() else "",
                elevationGainM = if (metadataType == "fitness" && json.has("elevation_gain_m")) json.getInt("elevation_gain_m").toString() else "",
                avgHeartRate = if (metadataType == "fitness" && json.has("avg_heart_rate")) json.getInt("avg_heart_rate").toString() else "",
                garminUrl = if (metadataType == "fitness") json.optString("garmin_activity_url") else "",
                avgPaceMinKm = if (metadataType == "fitness" && json.has("avg_pace_min_km")) json.getDouble("avg_pace_min_km").toString() else "",
                bike = if (metadataType == "fitness") json.optString("bike") else "",
                avgSpeedKmh = if (metadataType == "fitness" && json.has("avg_speed_kmh")) json.getDouble("avg_speed_kmh").toString() else "",
                trailName = if (metadataType == "fitness") json.optString("trail_name") else "",
                alltrailsUrl = if (metadataType == "fitness") json.optString("alltrails_url") else "",
                resort = if (metadataType == "fitness") json.optString("resort") else "",
                verticalDropM = if (metadataType == "fitness" && json.has("vertical_drop_m")) json.getInt("vertical_drop_m").toString() else "",
                runs = if (metadataType == "fitness" && json.has("runs")) json.getInt("runs").toString() else "",
                diveSite = if (metadataType == "fitness") json.optString("dive_site") else "",
                maxDepthM = if (metadataType == "fitness" && json.has("max_depth_m")) json.getDouble("max_depth_m").toString() else "",
                avgDepthM = if (metadataType == "fitness" && json.has("avg_depth_m")) json.getDouble("avg_depth_m").toString() else "",
                climbingType = if (metadataType == "fitness") climbingTypeFromName(json.optString("climbing_type")) else ClimbingType.CLIMBING_TYPE_UNSPECIFIED,
                routeName = if (metadataType == "fitness") json.optString("route_name") else "",
                problemName = if (metadataType == "fitness") json.optString("problem_name") else "",
                grade = if (metadataType == "fitness") json.optString("grade") else "",
                courseName = if (metadataType == "fitness") json.optString("course_name") else "",
                holes = if (metadataType == "fitness" && json.has("holes")) json.getInt("holes").toString() else "",
                score = if (metadataType == "fitness" && json.has("score")) json.getInt("score").toString() else "",
                opponent = if (metadataType == "fitness") json.optString("opponent") else "",
                result = if (metadataType == "fitness") json.optString("result") else "",
                visibility = visibility,
            )
        }
    }

    // --- Setters ---

    fun setTitle(value: String) = _uiState.update { it.copy(title = value) }
    fun setDescription(value: String) = _uiState.update { it.copy(description = value) }

    /**
     * Updates whichever primary date field the original entity used.
     * Point events that use the 'date' proto field get their [date] updated;
     * everything else (spans and points using 'start_date') gets [startDate] updated.
     */
    fun setPrimaryDate(value: LocalDate) {
        val entity = _entity ?: return
        if (entity.date != null) {
            _uiState.update { it.copy(date = value) }
        } else {
            _uiState.update { it.copy(startDate = value) }
        }
    }

    fun setEndDate(value: LocalDate?) = _uiState.update { it.copy(endDate = value) }
    fun setIsbn(value: String) = _uiState.update { it.copy(isbn = value) }
    fun setYear(value: String) = _uiState.update { it.copy(year = value) }
    fun setDirector(value: String) = _uiState.update { it.copy(director = value) }
    fun setNetwork(value: String) = _uiState.update { it.copy(network = value) }
    fun setSeasonsWatched(value: String) = _uiState.update { it.copy(seasonsWatched = value) }
    fun setRating(value: Int) = _uiState.update { it.copy(rating = value) }
    fun setReview(value: String) = _uiState.update { it.copy(review = value) }
    fun setAirline(value: String) = _uiState.update { it.copy(airline = value) }
    fun setFlightNumber(value: String) = _uiState.update { it.copy(flightNumber = value) }
    fun setOriginIata(value: String) = _uiState.update { it.copy(originIata = value.uppercase()) }
    fun setDestinationIata(value: String) = _uiState.update { it.copy(destinationIata = value.uppercase()) }
    fun setScheduledDeparture(value: LocalTime?) = _uiState.update { it.copy(scheduledDeparture = value) }
    fun setActualDeparture(value: LocalTime?) = _uiState.update { it.copy(actualDeparture = value) }
    fun setActualArrival(value: LocalTime?) = _uiState.update { it.copy(actualArrival = value) }
    fun setDuration(value: String) = _uiState.update { it.copy(duration = value) }
    fun setDistanceKm(value: String) = _uiState.update { it.copy(distanceKm = value) }
    fun setElevationGainM(value: String) = _uiState.update { it.copy(elevationGainM = value) }
    fun setAvgHeartRate(value: String) = _uiState.update { it.copy(avgHeartRate = value) }
    fun setGarminUrl(value: String) = _uiState.update { it.copy(garminUrl = value) }
    fun setAvgPaceMinKm(value: String) = _uiState.update { it.copy(avgPaceMinKm = value) }
    fun setBike(value: String) = _uiState.update { it.copy(bike = value) }
    fun setAvgSpeedKmh(value: String) = _uiState.update { it.copy(avgSpeedKmh = value) }
    fun setTrailName(value: String) = _uiState.update { it.copy(trailName = value) }
    fun setAlltrailsUrl(value: String) = _uiState.update { it.copy(alltrailsUrl = value) }
    fun setResort(value: String) = _uiState.update { it.copy(resort = value) }
    fun setVerticalDropM(value: String) = _uiState.update { it.copy(verticalDropM = value) }
    fun setRuns(value: String) = _uiState.update { it.copy(runs = value) }
    fun setDiveSite(value: String) = _uiState.update { it.copy(diveSite = value) }
    fun setMaxDepthM(value: String) = _uiState.update { it.copy(maxDepthM = value) }
    fun setAvgDepthM(value: String) = _uiState.update { it.copy(avgDepthM = value) }
    fun setClimbingType(value: ClimbingType) = _uiState.update { it.copy(climbingType = value) }
    fun setRouteName(value: String) = _uiState.update { it.copy(routeName = value) }
    fun setProblemName(value: String) = _uiState.update { it.copy(problemName = value) }
    fun setGrade(value: String) = _uiState.update { it.copy(grade = value) }
    fun setCourseName(value: String) = _uiState.update { it.copy(courseName = value) }
    fun setHoles(value: String) = _uiState.update { it.copy(holes = value) }
    fun setScore(value: String) = _uiState.update { it.copy(score = value) }
    fun setOpponent(value: String) = _uiState.update { it.copy(opponent = value) }
    fun setResult(value: String) = _uiState.update { it.copy(result = value) }
    fun setVisibility(value: Visibility) = _uiState.update { it.copy(visibility = value) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    companion object {
        private const val TAG = "EditEventViewModel"
        const val YEAR_MIN_FILM = 1888  // matches FilmEntryViewModel
        const val YEAR_MIN_TV   = 1925  // matches TvEntryViewModel
        const val YEAR_MAX      = 2100
        val TIME_FORMATTER: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

        fun parseFlightTime(value: String): LocalTime? {
            if (value.isBlank()) return null
            return runCatching { LocalTime.parse(value, TIME_FORMATTER) }.getOrNull()
                ?: runCatching { LocalTime.parse(value) }.getOrNull()
        }
    }

private fun fitnessActivityFromName(s: String): FitnessActivity = when (s) {
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

private fun climbingTypeFromName(s: String): ClimbingType = when (s) {
    "CLIMBING_TYPE_SPORT"      -> ClimbingType.CLIMBING_TYPE_SPORT
    "CLIMBING_TYPE_BOULDERING" -> ClimbingType.CLIMBING_TYPE_BOULDERING
    "CLIMBING_TYPE_GYM"        -> ClimbingType.CLIMBING_TYPE_GYM
    else                       -> ClimbingType.CLIMBING_TYPE_UNSPECIFIED
}

private class FitnessParseContext {
    var error: String? = null

    fun optDouble(value: String, label: String): Double? {
        if (error != null || value.isBlank()) return null
        val parsed = value.toDoubleOrNull()
        if (parsed == null) error = "$label must be a valid number"
        return parsed
    }

    fun optInt(value: String, label: String): Int? {
        if (error != null || value.isBlank()) return null
        val parsed = value.toIntOrNull()
        if (parsed == null) error = "$label must be a whole number"
        return parsed
    }
}

    // --- Submit ---

    fun submit() {
        val state = _uiState.value
        val entity = _entity ?: return

        // Validation
        if (state.title.isBlank()) {
            _uiState.update { it.copy(error = "Title is required") }
            return
        }
        when (entity.type) {
            "span" -> {
                if (state.startDate == null) {
                    _uiState.update { it.copy(error = "Start date is required") }
                    return
                }
                if (state.endDate != null && state.endDate < state.startDate) {
                    _uiState.update { it.copy(error = "End date cannot be before start date") }
                    return
                }
            }
            "point" -> {
                if (state.date == null && state.startDate == null) {
                    _uiState.update { it.copy(error = "Date is required") }
                    return
                }
            }
        }
        // Fitness: pre-parse all numeric fields so we can validate before isSubmitting = true
        var fitnessDistanceKm: Double? = null
        var fitnessElevationGainM: Int? = null
        var fitnessAvgHeartRate: Int? = null
        var fitnessAvgPaceMinKm: Double? = null
        var fitnessAvgSpeedKmh: Double? = null
        var fitnessVerticalDropM: Int? = null
        var fitnessRuns: Int? = null
        var fitnessMaxDepthM: Double? = null
        var fitnessAvgDepthM: Double? = null
        var fitnessHoles: Int? = null
        var fitnessScore: Int? = null
        if (state.metadataType == "fitness") {
            val ctx = FitnessParseContext()
            fitnessDistanceKm   = ctx.optDouble(state.distanceKm,    "Distance")
            fitnessElevationGainM = ctx.optInt(state.elevationGainM, "Elevation gain")
            fitnessAvgHeartRate = ctx.optInt(state.avgHeartRate,      "Avg heart rate")
            fitnessAvgPaceMinKm = ctx.optDouble(state.avgPaceMinKm,  "Avg pace")
            fitnessAvgSpeedKmh  = ctx.optDouble(state.avgSpeedKmh,   "Avg speed")
            fitnessVerticalDropM = ctx.optInt(state.verticalDropM,   "Vertical drop")
            fitnessRuns         = ctx.optInt(state.runs,              "Runs")
            fitnessMaxDepthM    = ctx.optDouble(state.maxDepthM,      "Max depth")
            fitnessAvgDepthM    = ctx.optDouble(state.avgDepthM,      "Avg depth")
            fitnessHoles        = ctx.optInt(state.holes,             "Holes")
            fitnessScore        = ctx.optInt(state.score,             "Score")
            if (ctx.error != null) {
                _uiState.update { it.copy(error = ctx.error) }
                return
            }
        }

        val yearInt: Int? = if (state.metadataType == "film_tv" && state.year.isNotBlank()) {
            val parsed = state.year.toIntOrNull()
            val yearMin = if (state.filmTvSubtype == "FILM_TV_TYPE_TV") YEAR_MIN_TV else YEAR_MIN_FILM
            if (parsed == null || parsed < yearMin || parsed > YEAR_MAX) {
                _uiState.update { it.copy(error = "Year must be between $yearMin and $YEAR_MAX") }
                return
            }
            parsed
        } else null

        if (state.metadataType == "film_tv" && state.filmTvSubtype == "FILM_TV_TYPE_TV"
            && state.seasonsWatched.isNotBlank()) {
            val seasons = state.seasonsWatched.toIntOrNull()
            if (seasons == null || seasons < 1) {
                _uiState.update { it.copy(error = "Seasons watched must be a positive number") }
                return
            }
        }

        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                // Base: full round-trip request preserving all unedited fields (including metadata
                // passthrough fields like coverImageUrl, tmdbId, etc.)
                val builder = entity.toUpdateRequest().toBuilder()

                // Common overrides
                builder.setVisibility(state.visibility)
                builder.setTitle(state.title.trim())
                if (state.description.isBlank()) builder.clearDescription()
                else builder.setDescription(state.description.trim())

                // Dates — clear all, then set only the fields that were in use
                builder.clearDate().clearStartDate().clearEndDate()
                if (entity.date != null) {
                    // Point event using the proto 'date' field
                    state.date?.let { builder.setDate(it.toString()) }
                } else {
                    // Span or point event using 'start_date'
                    state.startDate?.let { builder.setStartDate(it.toString()) }
                    state.endDate?.let { builder.setEndDate(it.toString()) }
                }

                // Metadata: patch only the editable fields, preserving passthrough fields
                // from the base request (e.g. author, coverImageUrl, tmdbId, posterUrl, tail#…)
                when (state.metadataType) {
                    "book" -> {
                        val updated = builder.bookMetadata.toBuilder()
                            .setIsbn(state.isbn.trim())
                            .setRating(state.rating)
                            .setReview(state.review.trim())
                            .build()
                        builder.setBookMetadata(updated)
                    }
                    "film_tv" -> {
                        val filmTvType = when (state.filmTvSubtype) {
                            "FILM_TV_TYPE_MOVIE" -> FilmTVType.FILM_TV_TYPE_MOVIE
                            "FILM_TV_TYPE_TV"    -> FilmTVType.FILM_TV_TYPE_TV
                            else                 -> FilmTVType.FILM_TV_TYPE_UNSPECIFIED
                        }
                        val metaBuilder = builder.filmTvMetadata.toBuilder()
                            .setRating(state.rating)
                            .setReview(state.review.trim())
                            .setYear(yearInt ?: 0)
                        when (filmTvType) {
                            FilmTVType.FILM_TV_TYPE_MOVIE -> {
                                if (state.director.isNotBlank()) metaBuilder.setDirector(state.director.trim())
                                else metaBuilder.clearDirector()
                            }
                            FilmTVType.FILM_TV_TYPE_TV -> {
                                if (state.network.isNotBlank()) metaBuilder.setNetwork(state.network.trim())
                                else metaBuilder.clearNetwork()
                                val seasons = state.seasonsWatched.toIntOrNull()
                                if (seasons != null && seasons > 0) metaBuilder.setSeasonsWatched(seasons)
                                else metaBuilder.clearSeasonsWatched()
                            }
                            else -> Unit
                        }
                        builder.setFilmTvMetadata(metaBuilder.build())
                    }
                    "flight" -> {
                        val metaBuilder = builder.flightMetadata.toBuilder()
                            .setAirline(state.airline.trim())
                            .setFlightNumber(state.flightNumber.trim())
                            .setOriginIata(state.originIata.trim())
                            .setDestinationIata(state.destinationIata.trim())
                        if (state.scheduledDeparture == null) metaBuilder.clearScheduledDeparture()
                        else metaBuilder.setScheduledDeparture(state.scheduledDeparture.format(TIME_FORMATTER))
                        if (state.actualDeparture == null) metaBuilder.clearActualDeparture()
                        else metaBuilder.setActualDeparture(state.actualDeparture.format(TIME_FORMATTER))
                        if (state.actualArrival == null) metaBuilder.clearActualArrival()
                        else metaBuilder.setActualArrival(state.actualArrival.format(TIME_FORMATTER))
                        builder.setFlightMetadata(metaBuilder.build())
                    }
                    "fitness" -> {
                        val updated = builder.fitnessMetadata.toBuilder()
                            .setDuration(state.duration.trim())
                            .setGarminActivityUrl(state.garminUrl.trim())
                            .setBike(state.bike.trim())
                            .setTrailName(state.trailName.trim())
                            .setAlltrailsUrl(state.alltrailsUrl.trim())
                            .setResort(state.resort.trim())
                            .setDiveSite(state.diveSite.trim())
                            .setClimbingType(state.climbingType)
                            .setRouteName(state.routeName.trim())
                            .setProblemName(state.problemName.trim())
                            .setGrade(state.grade.trim())
                            .setCourseName(state.courseName.trim())
                            .setOpponent(state.opponent.trim())
                            .setResult(state.result.trim())
                            // clear all optional numerics then conditionally restore
                            .clearDistanceKm().clearElevationGainM().clearAvgHeartRate()
                            .clearAvgPaceMinKm().clearAvgSpeedKmh()
                            .clearVerticalDropM().clearRuns()
                            .clearMaxDepthM().clearAvgDepthM()
                            .clearHoles().clearScore()
                            .also { b -> fitnessDistanceKm?.let { b.setDistanceKm(it) } }
                            .also { b -> fitnessElevationGainM?.let { b.setElevationGainM(it) } }
                            .also { b -> fitnessAvgHeartRate?.let { b.setAvgHeartRate(it) } }
                            .also { b -> fitnessAvgPaceMinKm?.let { b.setAvgPaceMinKm(it) } }
                            .also { b -> fitnessAvgSpeedKmh?.let { b.setAvgSpeedKmh(it) } }
                            .also { b -> fitnessVerticalDropM?.let { b.setVerticalDropM(it) } }
                            .also { b -> fitnessRuns?.let { b.setRuns(it) } }
                            .also { b -> fitnessMaxDepthM?.let { b.setMaxDepthM(it) } }
                            .also { b -> fitnessAvgDepthM?.let { b.setAvgDepthM(it) } }
                            .also { b -> fitnessHoles?.let { b.setHoles(it) } }
                            .also { b -> fitnessScore?.let { b.setScore(it) } }
                            .build()
                        builder.setFitnessMetadata(updated)
                    }
                }

                updateEventUseCase(builder.build())
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, error = e.message ?: "Update failed")
                }
            }
        }
    }
}
