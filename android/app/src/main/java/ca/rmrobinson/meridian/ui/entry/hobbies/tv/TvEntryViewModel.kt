package ca.rmrobinson.meridian.ui.entry.hobbies.tv

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.domain.usecase.CreateEventUseCase
import ca.rmrobinson.meridian.ui.entry.hobbies.HobbyEntryViewModel
import ca.rmrobinson.meridian.ui.entry.hobbies.HobbyType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import meridian.v1.CreateEventRequest
import meridian.v1.EventType
import meridian.v1.FilmTVMetadata
import meridian.v1.FilmTVType
import meridian.v1.Visibility
import java.time.LocalDate
import javax.inject.Inject

@HiltViewModel
class TvEntryViewModel @Inject constructor(
    @Suppress("UNUSED_PARAMETER") savedStateHandle: SavedStateHandle,
    private val createEventUseCase: CreateEventUseCase,
    private val repository: EventRepository,
) : ViewModel() {

    private val familyId = HobbyEntryViewModel.familyIdFor(HobbyType.TV)

    data class UiState(
        val title: String = "",
        val year: String = "",
        val network: String = "",
        val startDate: LocalDate = LocalDate.now(),
        val endDate: LocalDate? = null,
        val seasonsWatched: String = "",
        val rating: Int = 0,
        val review: String = "",
        val isSubmitting: Boolean = false,
        val error: String? = null,
        val isSuccess: Boolean = false,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun setTitle(value: String) = _uiState.update { it.copy(title = value) }
    fun setYear(value: String) = _uiState.update { it.copy(year = value) }
    fun setNetwork(value: String) = _uiState.update { it.copy(network = value) }
    fun setStartDate(value: LocalDate) = _uiState.update { it.copy(startDate = value) }
    fun setEndDate(value: LocalDate?) = _uiState.update { it.copy(endDate = value) }
    fun setSeasonsWatched(value: String) = _uiState.update { it.copy(seasonsWatched = value) }
    fun setRating(value: Int) = _uiState.update { it.copy(rating = value) }
    fun setReview(value: String) = _uiState.update { it.copy(review = value) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    fun submit() {
        val state = _uiState.value
        if (state.title.isBlank()) {
            _uiState.update { it.copy(error = "Title is required") }
            return
        }
        val yearInt: Int? = if (state.year.isNotBlank()) {
            val parsed = state.year.toIntOrNull()
            if (parsed == null || parsed < YEAR_MIN || parsed > YEAR_MAX) {
                _uiState.update { it.copy(error = "Year must be between $YEAR_MIN and $YEAR_MAX") }
                return
            }
            parsed
        } else null
        if (state.endDate != null && state.endDate < state.startDate) {
            _uiState.update { it.copy(error = "Finish date cannot be before start date") }
            return
        }
        val seasonsInt: Int? = if (state.seasonsWatched.isNotBlank()) {
            val parsed = state.seasonsWatched.toIntOrNull()
            if (parsed == null || parsed < 1) {
                _uiState.update { it.copy(error = "Seasons watched must be a positive number") }
                return
            }
            parsed
        } else null

        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val lineKey = nextLineKey("$familyId-${state.startDate}")
                val metadata = FilmTVMetadata.newBuilder()
                    .setType(FilmTVType.FILM_TV_TYPE_TV)
                    .setRating(state.rating)
                    .setReview(state.review.trim())
                    .apply { if (yearInt != null) setYear(yearInt) }
                    .apply { if (state.network.isNotBlank()) setNetwork(state.network.trim()) }
                    .apply { if (seasonsInt != null) setSeasonsWatched(seasonsInt) }
                    .build()
                val request = CreateEventRequest.newBuilder()
                    .setFamilyId(familyId)
                    .setType(EventType.EVENT_TYPE_SPAN)
                    .setTitle(state.title.trim())
                    .setStartDate(state.startDate.toString())
                    .apply { if (state.endDate != null) setEndDate(state.endDate.toString()) }
                    .setLineKey(lineKey)
                    .setVisibility(Visibility.VISIBILITY_FRIENDS)
                    .setFilmTvMetadata(metadata)
                    .build()
                createEventUseCase(request)
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, error = e.message ?: "Failed to save TV series")
                }
            }
        }
    }

    private suspend fun nextLineKey(base: String): String {
        val existing = repository.getLineKeysByFamilyId(familyId)
        if (!existing.contains(base)) return base
        var suffix = 2
        while (existing.contains("$base-$suffix")) suffix++
        return "$base-$suffix"
    }

    companion object {
        const val YEAR_MIN = 1925
        const val YEAR_MAX = 2100
    }
}
