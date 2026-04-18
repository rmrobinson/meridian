package ca.rmrobinson.meridian.ui.entry.hobbies.book

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
import meridian.v1.BookMetadata
import meridian.v1.CreateEventRequest
import meridian.v1.EventType
import meridian.v1.Visibility
import java.time.LocalDate
import javax.inject.Inject

@HiltViewModel
class BookEntryViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val createEventUseCase: CreateEventUseCase,
    private val repository: EventRepository,
) : ViewModel() {

    private val familyId = HobbyEntryViewModel.familyIdFor(HobbyType.BOOK)

    data class UiState(
        val title: String = "",
        val isbn: String = "",
        val startDate: LocalDate = LocalDate.now(),
        val endDate: LocalDate? = null,
        val rating: Int = 0,
        val review: String = "",
        val isSubmitting: Boolean = false,
        val error: String? = null,
        val isSuccess: Boolean = false,
    )

    private val _uiState = MutableStateFlow(
        UiState(isbn = savedStateHandle.get<String>("isbn") ?: ""),
    )
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun setTitle(value: String) = _uiState.update { it.copy(title = value) }
    fun setIsbn(value: String) = _uiState.update { it.copy(isbn = value) }
    fun setStartDate(value: LocalDate) = _uiState.update { it.copy(startDate = value) }
    fun setEndDate(value: LocalDate?) = _uiState.update { it.copy(endDate = value) }
    fun setRating(value: Int) = _uiState.update { it.copy(rating = value) }
    fun setReview(value: String) = _uiState.update { it.copy(review = value) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    fun submit() {
        val state = _uiState.value
        if (state.title.isBlank() && state.isbn.isBlank()) {
            _uiState.update { it.copy(error = "Title or ISBN is required") }
            return
        }
        if (state.endDate != null && state.endDate < state.startDate) {
            _uiState.update { it.copy(error = "Finish date cannot be before start date") }
            return
        }
        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val lineKey = repository.nextLineKeyForDate(familyId, state.startDate.toString())
                val request = CreateEventRequest.newBuilder()
                    .setFamilyId(familyId)
                    .setType(EventType.EVENT_TYPE_SPAN)
                    .setTitle(state.title.trim())
                    .setStartDate(state.startDate.toString())
                    .apply { if (state.endDate != null) setEndDate(state.endDate.toString()) }
                    .setLineKey(lineKey)
                    .setVisibility(Visibility.VISIBILITY_PUBLIC)
                    .setBookMetadata(
                        BookMetadata.newBuilder()
                            .setIsbn(state.isbn.trim())
                            .setRating(state.rating)
                            .setReview(state.review.trim())
                            .build(),
                    )
                    .build()
                createEventUseCase(request)
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, error = e.message ?: "Failed to save book")
                }
            }
        }
    }
}
