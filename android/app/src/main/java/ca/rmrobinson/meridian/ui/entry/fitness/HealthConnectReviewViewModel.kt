package ca.rmrobinson.meridian.ui.entry.fitness

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.data.healthconnect.HealthActivity
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.HcEventLinkDao
import ca.rmrobinson.meridian.data.local.HcEventLinkEntity
import ca.rmrobinson.meridian.data.local.HcLinkStatus
import ca.rmrobinson.meridian.data.healthExerciseTypeToFitnessActivity
import ca.rmrobinson.meridian.domain.usecase.HealthConnectSyncUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.ZoneId
import javax.inject.Inject

@HiltViewModel
class HealthConnectReviewViewModel @Inject constructor(
    private val repository: EventRepository,
    private val hcEventLinkDao: HcEventLinkDao,
    private val syncUseCase: HealthConnectSyncUseCase,
) : ViewModel() {

    enum class ItemAction { NONE, IMPORT, MERGE, SKIP }

    data class ReviewItem(
        val activity: HealthActivity,
        val action: ItemAction = ItemAction.NONE,
        val mergeTargetId: String? = null,
        val hasError: Boolean = false,
    )

    data class UiState(
        val isLoading: Boolean = true,
        val items: List<ReviewItem> = emptyList(),
        val mergeSheetItem: ReviewItem? = null,
        val mergeCandidates: List<EventEntity> = emptyList(),
        val isConfirming: Boolean = false,
        val isDone: Boolean = false,
        val error: String? = null,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            // replay=1 ensures we get the last emission immediately on collection.
            // Only apply while not in the middle of confirming or done, so that a
            // background re-sync does not overwrite in-progress user selections.
            syncUseCase.pendingActivities.collect { activities ->
                if (!_uiState.value.isConfirming && !_uiState.value.isDone) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            items = activities.map { a -> ReviewItem(a) },
                        )
                    }
                }
            }
        }
    }

    fun setAction(hcId: String, action: ItemAction) {
        _uiState.update { state ->
            state.copy(
                items = state.items.map { item ->
                    if (item.activity.healthConnectId == hcId) {
                        item.copy(action = action, hasError = false)
                    } else {
                        item
                    }
                },
            )
        }
    }

    fun openMergeSheet(item: ReviewItem) {
        _uiState.update { it.copy(mergeSheetItem = item) }
        viewModelScope.launch {
            val date = item.activity.startTime
                .atZone(ZoneId.systemDefault())
                .toLocalDate()
            val candidates = repository.getFitnessEventsNear(date)
            _uiState.update { it.copy(mergeCandidates = candidates) }
        }
    }

    fun selectMergeTarget(item: ReviewItem, targetEventId: String) {
        _uiState.update { state ->
            state.copy(
                items = state.items.map { i ->
                    if (i.activity.healthConnectId == item.activity.healthConnectId) {
                        i.copy(action = ItemAction.MERGE, mergeTargetId = targetEventId, hasError = false)
                    } else {
                        i
                    }
                },
                mergeSheetItem = null,
                mergeCandidates = emptyList(),
            )
        }
    }

    fun closeMergeSheet() {
        _uiState.update { it.copy(mergeSheetItem = null, mergeCandidates = emptyList()) }
    }

    fun skipAll() {
        _uiState.update { state ->
            state.copy(items = state.items.map { it.copy(action = ItemAction.SKIP) })
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    /** Immediately writes a SKIPPED link and removes the item from the visible list. */
    fun skipImmediate(hcId: String) {
        viewModelScope.launch {
            hcEventLinkDao.upsert(
                HcEventLinkEntity(
                    hcId = hcId,
                    eventId = null,
                    status = HcLinkStatus.SKIPPED,
                    createdAt = System.currentTimeMillis(),
                ),
            )
            _uiState.update { state ->
                state.copy(items = state.items.filter { it.activity.healthConnectId != hcId })
            }
        }
    }

    /**
     * Processes all non-NONE items independently. Each item is processed in isolation
     * so a single failure does not block the others. Items that succeed are removed from
     * the list; items that fail are marked [ReviewItem.hasError] so the user can retry.
     * [UiState.isDone] is set only when no failures remain.
     */
    fun confirm() {
        val items = _uiState.value.items.filter { it.action != ItemAction.NONE }
        if (items.isEmpty()) {
            _uiState.update { it.copy(isDone = true) }
            return
        }

        _uiState.update { it.copy(isConfirming = true) }
        viewModelScope.launch {
            val failed = mutableSetOf<String>()

            for (item in items) {
                try {
                    when (item.action) {
                        ItemAction.IMPORT -> repository.createFromHealthConnect(item.activity)
                        ItemAction.MERGE -> {
                            val targetId = item.mergeTargetId ?: continue
                            repository.mergeHealthConnect(targetId, item.activity)
                        }
                        ItemAction.SKIP -> {
                            hcEventLinkDao.upsert(
                                HcEventLinkEntity(
                                    hcId = item.activity.healthConnectId,
                                    eventId = null,
                                    status = HcLinkStatus.SKIPPED,
                                    createdAt = System.currentTimeMillis(),
                                ),
                            )
                        }
                        ItemAction.NONE -> Unit
                    }
                } catch (e: Exception) {
                    failed += item.activity.healthConnectId
                }
            }

            _uiState.update { state ->
                val updatedItems = state.items
                    // Remove successfully-processed items (those that had an action and did not fail).
                    .filter { item ->
                        item.action == ItemAction.NONE || item.activity.healthConnectId in failed
                    }
                    // Mark failed items so the UI can highlight them.
                    .map { item ->
                        if (item.activity.healthConnectId in failed) {
                            item.copy(hasError = true)
                        } else {
                            item
                        }
                    }
                state.copy(
                    isConfirming = false,
                    items = updatedItems,
                    isDone = updatedItems.isEmpty(),
                    error = if (failed.isNotEmpty()) {
                        "${failed.size} item(s) failed to process — please retry"
                    } else {
                        null
                    },
                )
            }
        }
    }
}
