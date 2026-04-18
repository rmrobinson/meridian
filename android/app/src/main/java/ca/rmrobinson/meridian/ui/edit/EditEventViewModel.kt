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
import meridian.v1.FilmTVType
import meridian.v1.Visibility
import org.json.JSONObject
import java.time.LocalDate
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
    fun setVisibility(value: Visibility) = _uiState.update { it.copy(visibility = value) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    companion object {
        private const val TAG = "EditEventViewModel"
        const val YEAR_MIN_FILM = 1888  // matches FilmEntryViewModel
        const val YEAR_MIN_TV   = 1925  // matches TvEntryViewModel
        const val YEAR_MAX      = 2100
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
                        val updated = builder.flightMetadata.toBuilder()
                            .setAirline(state.airline.trim())
                            .setFlightNumber(state.flightNumber.trim())
                            .setOriginIata(state.originIata.trim())
                            .setDestinationIata(state.destinationIata.trim())
                            .build()
                        builder.setFlightMetadata(updated)
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
