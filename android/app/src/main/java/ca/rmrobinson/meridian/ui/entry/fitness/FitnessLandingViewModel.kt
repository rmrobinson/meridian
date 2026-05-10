package ca.rmrobinson.meridian.ui.entry.fitness

import android.util.Log
import androidx.activity.result.contract.ActivityResultContract
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectRepository
import ca.rmrobinson.meridian.domain.usecase.HealthConnectSyncUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "FitnessLandingVM"

@HiltViewModel
class FitnessLandingViewModel @Inject constructor(
    private val healthConnectRepository: HealthConnectRepository,
    private val healthConnectSyncUseCase: HealthConnectSyncUseCase,
) : ViewModel() {

    sealed class UiEvent {
        /** Emitted once when permissions are freshly granted; screen should navigate to review. */
        object NavigateToReview : UiEvent()
        /** Emitted once when the user explicitly denied permissions; screen should show feedback. */
        object PermissionsDenied : UiEvent()
    }

    data class UiState(
        val isHealthConnectAvailable: Boolean = false,
        val hasPermissions: Boolean = false,
        val pendingImportCount: Int = 0,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    // BUFFERED so an event emitted before the screen collects is not dropped.
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch { checkHealthConnect() }
        viewModelScope.launch {
            healthConnectSyncUseCase.pendingActivities.collect { activities ->
                _uiState.update { it.copy(pendingImportCount = activities.size) }
            }
        }
    }

    fun getRequiredPermissions(): Set<String> = healthConnectRepository.getRequiredPermissions()

    fun getPermissionContract(): ActivityResultContract<Set<String>, Set<String>> =
        healthConnectRepository.getPermissionContract()

    /**
     * Called by the screen after the HC permission activity returns.
     * Uses the returned [granted] set directly — does not re-query the repository — so the
     * navigation trigger is reliable even if the system permission state hasn't propagated yet.
     */
    fun onPermissionsResult(granted: Set<String>) {
        val required = healthConnectRepository.getRequiredPermissions()
        val allGranted = granted.containsAll(required)
        Log.d(TAG, "onPermissionsResult: granted=$granted required=$required allGranted=$allGranted")
        _uiState.update { it.copy(hasPermissions = allGranted) }
        viewModelScope.launch {
            if (allGranted) {
                healthConnectSyncUseCase()
                _events.send(UiEvent.NavigateToReview)
            } else {
                _events.send(UiEvent.PermissionsDenied)
            }
        }
    }

    private suspend fun checkHealthConnect() {
        val available = healthConnectRepository.isAvailable()
        val permissions = if (available) healthConnectRepository.hasPermissions() else false
        Log.d(TAG, "checkHealthConnect: available=$available hasPermissions=$permissions")
        _uiState.update { it.copy(isHealthConnectAvailable = available, hasPermissions = permissions) }
        // Sync once on ViewModel creation (i.e. first visit to the screen) if permissions
        // are already granted. The ViewModel is scoped to the back-stack entry, so this
        // fires exactly once per navigation to the fitness landing screen.
        if (permissions) {
            healthConnectSyncUseCase()
        }
    }
}
