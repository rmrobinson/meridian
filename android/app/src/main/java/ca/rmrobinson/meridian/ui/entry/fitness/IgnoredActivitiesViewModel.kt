package ca.rmrobinson.meridian.ui.entry.fitness

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.healthconnect.HealthActivity
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectPrefs
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectRepository
import ca.rmrobinson.meridian.data.local.HcEventLinkDao
import ca.rmrobinson.meridian.domain.usecase.HealthConnectSyncUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject

@HiltViewModel
class IgnoredActivitiesViewModel @Inject constructor(
    private val hcEventLinkDao: HcEventLinkDao,
    private val hcRepo: HealthConnectRepository,
    private val hcPrefs: HealthConnectPrefs,
    private val syncUseCase: HealthConnectSyncUseCase,
) : ViewModel() {

    data class UiState(
        val isLoading: Boolean = true,
        val items: List<HealthActivity> = emptyList(),
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val skippedIds = hcEventLinkDao.getSkipped().map { it.hcId }.toSet()
            val items = if (skippedIds.isEmpty()) {
                emptyList()
            } else {
                val lookbackStart = Instant.now().minus(hcPrefs.getLookbackWindowDays(), ChronoUnit.DAYS)
                hcRepo.fetchActivitiesSince(lookbackStart).filter { it.healthConnectId in skippedIds }
            }
            _uiState.update { UiState(isLoading = false, items = items) }
        }
    }

    fun unignore(hcId: String) {
        viewModelScope.launch {
            hcEventLinkDao.deleteSkippedByHcId(hcId)
            _uiState.update { state ->
                state.copy(items = state.items.filter { it.healthConnectId != hcId })
            }
            syncUseCase()
        }
    }
}
