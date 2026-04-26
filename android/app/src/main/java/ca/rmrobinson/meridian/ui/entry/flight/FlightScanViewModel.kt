package ca.rmrobinson.meridian.ui.entry.flight

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.domain.usecase.CreateEventUseCase
import ca.rmrobinson.meridian.util.BcbpParser
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
import javax.inject.Inject

@HiltViewModel
class FlightScanViewModel @Inject constructor(
    private val createEventUseCase: CreateEventUseCase,
    private val repository: EventRepository,
) : ViewModel() {

    /**
     * A boarding-pass leg with its date and display title already resolved, so
     * composition never calls LocalDate.now() and so that confirmAndSave() uses
     * the same values that were shown to the user.
     */
    data class ResolvedFlight(
        val parsed: BcbpParser.ParsedFlight,
        val date: LocalDate,
        val title: String,
        val scheduledDeparture: LocalTime? = null,
    )

    data class UiState(
        val resolvedFlights: List<ResolvedFlight> = emptyList(),
        val parseError: String? = null,
        val isSubmitting: Boolean = false,
        val submitError: String? = null,
        val isSuccess: Boolean = false,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun onBcbpReceived(raw: String) {
        val flights = BcbpParser.parse(raw)
        if (flights.isNullOrEmpty()) {
            _uiState.update { it.copy(parseError = "Could not read boarding pass. Please try again.") }
        } else {
            val resolved = flights.map { flight ->
                ResolvedFlight(
                    parsed = flight,
                    date = FlightEntryViewModel.julianToDate(flight.julianDate),
                    title = FlightEntryViewModel.buildTitle(
                        flight.operatingCarrierDesignator,
                        flight.flightNumber,
                        flight.originAirport,
                        flight.destinationAirport,
                    ),
                )
            }
            _uiState.update { it.copy(resolvedFlights = resolved, parseError = null) }
        }
    }

    fun setScheduledDeparture(index: Int, value: LocalTime?) {
        _uiState.update { state ->
            val updated = state.resolvedFlights.toMutableList()
            if (index in updated.indices) updated[index] = updated[index].copy(scheduledDeparture = value)
            state.copy(resolvedFlights = updated)
        }
    }

    fun dismissSubmitError() = _uiState.update { it.copy(submitError = null) }

    fun confirmAndSave() {
        val flights = _uiState.value.resolvedFlights
        if (flights.isEmpty()) return
        _uiState.update { it.copy(isSubmitting = true, submitError = null) }
        viewModelScope.launch {
            try {
                // Load all existing line keys for the travel family once, then track keys
                // allocated in this batch so that same-day legs in the same scan don't collide.
                val allocatedKeys = repository.getLineKeysByFamilyId(FlightEntryViewModel.FAMILY_ID)
                    .toMutableSet()

                flights.forEach { resolved ->
                    val base = "${FlightEntryViewModel.FAMILY_ID}-${resolved.date}"
                    val prefix = "$base-"
                    val maxSuffix = allocatedKeys
                        .filter { it.startsWith(prefix) }
                        .mapNotNull { it.removePrefix(prefix).toIntOrNull() }
                        .maxOrNull() ?: 0
                    val lineKey = "$prefix${maxSuffix + 1}"
                    allocatedKeys.add(lineKey)

                    val request = CreateEventRequest.newBuilder()
                        .setFamilyId(FlightEntryViewModel.FAMILY_ID)
                        .setType(EventType.EVENT_TYPE_POINT)
                        .setTitle(resolved.title)
                        .setStartDate(resolved.date.toString())
                        .setLineKey(lineKey)
                        .setVisibility(Visibility.VISIBILITY_PUBLIC)
                        .setFlightMetadata(
                            FlightMetadata.newBuilder()
                                .setAirline(resolved.parsed.operatingCarrierDesignator)
                                .setFlightNumber(resolved.parsed.flightNumber)
                                .setOriginIata(resolved.parsed.originAirport)
                                .setDestinationIata(resolved.parsed.destinationAirport)
                                .setBookingCode(resolved.parsed.bookingCode)
                                .also { b ->
                                    resolved.scheduledDeparture?.let {
                                        b.setScheduledDeparture(it.format(FlightEntryViewModel.TIME_FORMATTER))
                                    }
                                }
                                .build(),
                        )
                        .build()
                    createEventUseCase(request)
                }
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, submitError = e.message ?: "Failed to save flights")
                }
            }
        }
    }
}
