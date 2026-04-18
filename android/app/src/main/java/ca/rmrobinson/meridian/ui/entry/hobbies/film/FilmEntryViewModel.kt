package ca.rmrobinson.meridian.ui.entry.hobbies.film

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
class FilmEntryViewModel @Inject constructor(
    @Suppress("UNUSED_PARAMETER") savedStateHandle: SavedStateHandle,
    private val createEventUseCase: CreateEventUseCase,
    private val repository: EventRepository,
) : ViewModel() {

    private val familyId = HobbyEntryViewModel.familyIdFor(HobbyType.FILM)

    data class UiState(
        val title: String = "",
        val year: String = "",
        val director: String = "",
        val watchedDate: LocalDate = LocalDate.now(),
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
    fun setDirector(value: String) = _uiState.update { it.copy(director = value) }
    fun setWatchedDate(value: LocalDate) = _uiState.update { it.copy(watchedDate = value) }
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

        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val lineKey = nextLineKey("$familyId-${state.watchedDate}")
                val metadata = FilmTVMetadata.newBuilder()
                    .setType(FilmTVType.FILM_TV_TYPE_MOVIE)
                    .setRating(state.rating)
                    .setReview(state.review.trim())
                    .apply { if (yearInt != null) setYear(yearInt) }
                    .apply { if (state.director.isNotBlank()) setDirector(state.director.trim()) }
                    .build()
                val request = CreateEventRequest.newBuilder()
                    .setFamilyId(familyId)
                    .setType(EventType.EVENT_TYPE_POINT)
                    .setTitle(state.title.trim())
                    .setStartDate(state.watchedDate.toString())
                    .setLineKey(lineKey)
                    .setVisibility(Visibility.VISIBILITY_FRIENDS)
                    .setFilmTvMetadata(metadata)
                    .build()
                createEventUseCase(request)
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, error = e.message ?: "Failed to save film")
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
        const val YEAR_MIN = 1888
        const val YEAR_MAX = 2100
    }
}
