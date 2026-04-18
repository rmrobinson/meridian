package ca.rmrobinson.meridian.ui.timeline

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
import ca.rmrobinson.meridian.data.toUpdateRequest
import ca.rmrobinson.meridian.domain.usecase.SyncEventsUseCase
import ca.rmrobinson.meridian.domain.usecase.UpdateEventUseCase
import ca.rmrobinson.meridian.network.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class TimelineItem {
    data class YearHeader(val year: Int) : TimelineItem()
    data class EventRow(val event: EventEntity) : TimelineItem()
}

data class TimelineUiState(
    val isSyncing: Boolean = false,
    val isOffline: Boolean = false,
    val showOpenSpansOnly: Boolean = false,
    val items: List<TimelineItem> = emptyList(),
    val lineFamilies: Map<String, LineFamilyEntity> = emptyMap(),
    val error: String? = null,
    /** Event awaiting mark-complete in the bottom sheet, null = sheet hidden. */
    val markCompleteEvent: EventEntity? = null,
)

private const val TAG = "TimelineViewModel"

@HiltViewModel
class TimelineViewModel @Inject constructor(
    private val repository: EventRepository,
    private val syncEvents: SyncEventsUseCase,
    private val updateEvent: UpdateEventUseCase,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _syncState = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)
    private val _showOpenSpansOnly = MutableStateFlow(false)
    private val _markCompleteEvent = MutableStateFlow<EventEntity?>(null)

    // Combine the event list + families into a partial state, then merge the
    // remaining scalar flows to stay within the typed combine(5) limit.
    private val _eventsAndFamilies = combine(
        _showOpenSpansOnly.flatMapLatest { openOnly ->
            if (openOnly) repository.observeOpenSpans() else repository.observeEvents()
        },
        repository.observeLineFamilies(),
        _showOpenSpansOnly,
    ) { events, families, openOnly ->
        Triple(events, families, openOnly)
    }

    val uiState: StateFlow<TimelineUiState> = combine(
        _eventsAndFamilies,
        _syncState,
        _error,
        _markCompleteEvent,
        networkMonitor.isOnline,
    ) { (events, families, openOnly), syncing, error, markEvent, isOnline ->
        TimelineUiState(
            isSyncing = syncing,
            isOffline = !isOnline,
            showOpenSpansOnly = openOnly,
            items = buildTimelineItems(events),
            lineFamilies = families.associateBy { it.id },
            error = error,
            markCompleteEvent = markEvent,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = TimelineUiState(),
    )

    init {
        sync()
    }

    fun sync() {
        viewModelScope.launch {
            Log.d(TAG, "sync: starting")
            _syncState.update { true }
            _error.update { null }
            try {
                syncEvents()
                Log.d(TAG, "sync: complete")
            } catch (e: Exception) {
                Log.e(TAG, "sync: failed", e)
                _error.update { e.message ?: "Sync failed" }
            } finally {
                _syncState.update { false }
            }
        }
    }

    fun toggleOpenSpansFilter() {
        _showOpenSpansOnly.update { !it }
    }

    fun requestMarkComplete(event: EventEntity) {
        _markCompleteEvent.update { event }
    }

    fun dismissMarkComplete() {
        _markCompleteEvent.update { null }
    }

    fun confirmMarkComplete(event: EventEntity, endDate: String) {
        _markCompleteEvent.update { null }
        viewModelScope.launch {
            // Optimistic local write first so the UI updates immediately
            val optimistic = event.copy(
                endDate = endDate,
                syncState = SyncState.PENDING_UPDATE,
                updatedAt = System.currentTimeMillis(),
            )
            repository.saveLocal(optimistic)
            try {
                updateEvent(event.toUpdateRequest(newEndDate = endDate))
            } catch (e: Exception) {
                // Roll back to the pre-update state on failure
                repository.saveLocal(event)
                _error.update { e.message ?: "Update failed" }
            }
        }
    }

    fun dismissError() {
        _error.update { null }
    }

    private fun buildTimelineItems(events: List<EventEntity>): List<TimelineItem> {
        if (events.isEmpty()) return emptyList()

        val result = mutableListOf<TimelineItem>()
        var lastYear: Int? = null

        for (event in events) {
            val dateStr = event.date ?: event.startDate ?: continue
            val year = dateStr.take(4).toIntOrNull() ?: continue
            if (year != lastYear) {
                result.add(TimelineItem.YearHeader(year))
                lastYear = year
            }
            result.add(TimelineItem.EventRow(event))
        }
        return result
    }
}
