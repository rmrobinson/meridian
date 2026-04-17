package ca.rmrobinson.meridian.ui.entry.flight

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import javax.inject.Inject

@HiltViewModel
class FlightScanViewModel @Inject constructor(
    private val createEventUseCase: CreateEventUseCase,
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

    fun dismissSubmitError() = _uiState.update { it.copy(submitError = null) }

    fun confirmAndSave() {
        val flights = _uiState.value.resolvedFlights
        if (flights.isEmpty()) return
        _uiState.update { it.copy(isSubmitting = true, submitError = null) }
        viewModelScope.launch {
            try {
                // Track used keys per date to suffix same-day legs: travel-2025-07-03, travel-2025-07-03-2, ...
                val usedLineKeys = mutableMapOf<String, Int>()
                flights.forEach { resolved ->
                    val baseKey = "${FlightEntryViewModel.FAMILY_ID}-${resolved.date}"
                    val count = (usedLineKeys[baseKey] ?: 0) + 1
                    usedLineKeys[baseKey] = count
                    val lineKey = if (count == 1) baseKey else "$baseKey-$count"

                    val request = CreateEventRequest.newBuilder()
                        .setFamilyId(FlightEntryViewModel.FAMILY_ID)
                        .setType(EventType.EVENT_TYPE_POINT)
                        .setTitle(resolved.title)
                        .setStartDate(resolved.date.toString())
                        .setLineKey(lineKey)
                        .setVisibility(Visibility.VISIBILITY_PERSONAL)
                        .setFlightMetadata(
                            FlightMetadata.newBuilder()
                                .setAirline(resolved.parsed.operatingCarrierDesignator)
                                .setFlightNumber(resolved.parsed.flightNumber)
                                .setOriginIata(resolved.parsed.originAirport)
                                .setDestinationIata(resolved.parsed.destinationAirport)
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
