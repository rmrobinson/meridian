package ca.rmrobinson.meridian.ui.entry.hobbies.concert

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.domain.usecase.CreateEventUseCase
import ca.rmrobinson.meridian.ui.entry.hobbies.HobbyEntryViewModel
import ca.rmrobinson.meridian.ui.entry.hobbies.HobbyType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import meridian.v1.ConcertMetadata
import meridian.v1.CreateEventRequest
import meridian.v1.EventType
import meridian.v1.Location
import meridian.v1.Visibility
import java.time.LocalDate
import javax.inject.Inject

@HiltViewModel
class ConcertEntryViewModel @Inject constructor(
    private val createEventUseCase: CreateEventUseCase,
) : ViewModel() {

    private val familyId = HobbyEntryViewModel.familyIdFor(HobbyType.CONCERT)

    data class UiState(
        val mainAct: String = "",
        val openingActs: String = "",
        val venueLabel: String = "",
        val date: LocalDate = LocalDate.now(),
        val playlistUrl: String = "",
        val isSubmitting: Boolean = false,
        val error: String? = null,
        val isSuccess: Boolean = false,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun setMainAct(value: String) = _uiState.update { it.copy(mainAct = value) }
    fun setOpeningActs(value: String) = _uiState.update { it.copy(openingActs = value) }
    fun setVenueLabel(value: String) = _uiState.update { it.copy(venueLabel = value) }
    fun setDate(value: LocalDate) = _uiState.update { it.copy(date = value) }
    fun setPlaylistUrl(value: String) = _uiState.update { it.copy(playlistUrl = value) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    fun submit() {
        val s = _uiState.value
        if (s.mainAct.isBlank()) {
            _uiState.update { it.copy(error = "Artist / main act is required") }
            return
        }
        if (s.venueLabel.isBlank()) {
            _uiState.update { it.copy(error = "Venue is required") }
            return
        }

        val openingActsList = s.openingActs.split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val metadata = ConcertMetadata.newBuilder()
                    .setMainAct(s.mainAct.trim())
                    .addAllOpeningActs(openingActsList)
                    .setVenue(Location.newBuilder().setLabel(s.venueLabel.trim()))
                    .setPlaylistUrl(s.playlistUrl.trim())
                    .build()
                val request = CreateEventRequest.newBuilder()
                    .setFamilyId(familyId)
                    .setType(EventType.EVENT_TYPE_POINT)
                    .setTitle(s.mainAct.trim())
                    .setLabel(s.venueLabel.trim())
                    .setIcon("mdi:music")
                    .setDate(s.date.toString())
                    // Concerts share the hobbies secondary spine rather than spawning a
                    // per-event branch, so the line key is the constant family id.
                    .setLineKey(familyId)
                    .setVisibility(Visibility.VISIBILITY_PUBLIC)
                    .setConcertMetadata(metadata)
                    .build()
                createEventUseCase(request)
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, error = e.message ?: "Failed to save concert")
                }
            }
        }
    }
}
