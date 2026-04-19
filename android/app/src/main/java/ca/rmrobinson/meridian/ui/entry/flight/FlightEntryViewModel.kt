package ca.rmrobinson.meridian.ui.entry.flight

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.domain.usecase.CreateEventUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import meridian.v1.CreateEventRequest
import meridian.v1.EventType
import meridian.v1.FlightMetadata
import meridian.v1.Visibility
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class FlightEntryViewModel @Inject constructor(
    @Suppress("UNUSED_PARAMETER") savedStateHandle: SavedStateHandle,
    private val createEventUseCase: CreateEventUseCase,
    private val repository: EventRepository,
) : ViewModel() {

    data class UiState(
        val airline: String = "",
        val flightNumber: String = "",
        val originIata: String = "",
        val destinationIata: String = "",
        val departureDate: LocalDate = LocalDate.now(),
        val scheduledDeparture: LocalTime? = null,
        val isSubmitting: Boolean = false,
        val error: String? = null,
        val isSuccess: Boolean = false,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun setAirline(value: String) = _uiState.update { it.copy(airline = value) }
    fun setFlightNumber(value: String) = _uiState.update { it.copy(flightNumber = value) }
    fun setOriginIata(value: String) = _uiState.update { it.copy(originIata = value.uppercase()) }
    fun setDestinationIata(value: String) = _uiState.update { it.copy(destinationIata = value.uppercase()) }
    fun setDepartureDate(value: LocalDate) = _uiState.update { it.copy(departureDate = value) }
    fun setScheduledDeparture(value: LocalTime?) = _uiState.update { it.copy(scheduledDeparture = value) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    fun submit() {
        val state = _uiState.value
        if (state.airline.isBlank()) {
            _uiState.update { it.copy(error = "Airline code is required") }
            return
        }
        if (state.flightNumber.isBlank()) {
            _uiState.update { it.copy(error = "Flight number is required") }
            return
        }
        if (state.originIata.isBlank()) {
            _uiState.update { it.copy(error = "Origin airport is required") }
            return
        }
        if (state.destinationIata.isBlank()) {
            _uiState.update { it.copy(error = "Destination airport is required") }
            return
        }
        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val title = buildTitle(
                    state.airline,
                    state.flightNumber,
                    state.originIata,
                    state.destinationIata,
                )
                val lineKey = repository.nextLineKeyForDate(FAMILY_ID, state.departureDate.toString())
                val request = CreateEventRequest.newBuilder()
                    .setFamilyId(FAMILY_ID)
                    .setType(EventType.EVENT_TYPE_POINT)
                    .setTitle(title)
                    .setStartDate(state.departureDate.toString())
                    .setLineKey(lineKey)
                    .setVisibility(Visibility.VISIBILITY_PUBLIC)
                    .setFlightMetadata(
                        FlightMetadata.newBuilder()
                            .setAirline(state.airline.trim())
                            .setFlightNumber(state.flightNumber.trim())
                            .setOriginIata(state.originIata.trim())
                            .setDestinationIata(state.destinationIata.trim())
                            .also { b ->
                                state.scheduledDeparture?.let { b.setScheduledDeparture(it.format(TIME_FORMATTER)) }
                            }
                            .build(),
                    )
                    .build()
                createEventUseCase(request)
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, error = e.message ?: "Failed to save flight")
                }
            }
        }
    }

    companion object {
        const val FAMILY_ID = "travel"
        val TIME_FORMATTER: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

        /**
         * Converts an IATA Julian day-of-year (1–366) to a [LocalDate].
         * If the julian value exceeds today's day-of-year the flight departed in the prior year
         * (handles year boundary on multi-day itineraries purchased in advance).
         */
        fun julianToDate(julian: Int): LocalDate {
            val today = LocalDate.now()
            val year = if (julian > today.dayOfYear) today.year - 1 else today.year
            return LocalDate.ofYearDay(year, julian)
        }

        /** Builds a human-readable flight title, e.g. "AC301 YYZ→LHR". */
        fun buildTitle(
            airline: String,
            flightNumber: String,
            origin: String,
            destination: String,
        ): String = "${airline.trim()}${flightNumber.trim()} ${origin.trim().uppercase()}→${destination.trim().uppercase()}"
    }
}
