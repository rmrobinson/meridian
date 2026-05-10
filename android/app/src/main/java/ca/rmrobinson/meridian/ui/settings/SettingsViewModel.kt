package ca.rmrobinson.meridian.ui.settings

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.AppConfig
import ca.rmrobinson.meridian.AppConfigStore
import ca.rmrobinson.meridian.ThemeMode
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectRepository
import ca.rmrobinson.meridian.data.remote.GrpcClient
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val grpcHost: String = "",
    val grpcPort: String = "443",
    val bearerToken: String = "",
    val usePlaintext: Boolean = false,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val isHealthConnectAvailable: Boolean = false,
    val hasHealthConnectPermissions: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val prefs: SharedPreferences,
    private val store: AppConfigStore,
    private val grpcClient: GrpcClient,
    private val healthConnectRepository: HealthConnectRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        store.current.let { cfg ->
            SettingsUiState(
                grpcHost = cfg.grpcHost,
                grpcPort = cfg.grpcPort.toString(),
                bearerToken = cfg.bearerToken,
                usePlaintext = cfg.usePlaintext,
                themeMode = cfg.themeMode,
            )
        },
    )
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch { refreshHealthConnectStatus() }
    }

    fun getHealthConnectRequiredPermissions(): Set<String> = healthConnectRepository.getRequiredPermissions()

    fun getHealthConnectPermissionContract(): ActivityResultContract<Set<String>, Set<String>> =
        healthConnectRepository.getPermissionContract()

    fun onHealthConnectPermissionsResult(@Suppress("UNUSED_PARAMETER") granted: Set<String>) {
        viewModelScope.launch { refreshHealthConnectStatus() }
    }

    /**
     * Returns an Intent that opens Health Connect's permission management screen for this app.
     * Used by the "Manage" button when permissions are already granted — the grant dialog
     * returns immediately with no UI in that case, so we redirect to the management screen instead.
     */
    /**
     * Opens Health Connect's data management screen for this app (where the user can view
     * or revoke permissions). Available in alpha10 via [HealthConnectClient.getHealthConnectManageDataIntent].
     */
    fun buildManageHcPermissionsIntent(): Intent =
        HealthConnectClient.getHealthConnectManageDataIntent(context)

    private suspend fun refreshHealthConnectStatus() {
        val available = healthConnectRepository.isAvailable()
        val hasPermissions = if (available) healthConnectRepository.hasPermissions() else false
        _uiState.update {
            it.copy(isHealthConnectAvailable = available, hasHealthConnectPermissions = hasPermissions)
        }
    }

    fun updateHost(value: String) = _uiState.update { it.copy(grpcHost = value) }
    fun updatePort(value: String) = _uiState.update { it.copy(grpcPort = value) }
    fun updateToken(value: String) = _uiState.update { it.copy(bearerToken = value) }
    fun updateUsePlaintext(value: Boolean) = _uiState.update { it.copy(usePlaintext = value) }
    fun updateThemeMode(value: ThemeMode) = _uiState.update { it.copy(themeMode = value) }

    fun save() {
        val state = _uiState.value
        val config = AppConfig(
            grpcHost = state.grpcHost.trim(),
            grpcPort = state.grpcPort.toIntOrNull() ?: 443,
            bearerToken = state.bearerToken.trim(),
            usePlaintext = state.usePlaintext,
            themeMode = state.themeMode,
        )
        config.saveToPrefs(prefs)
        store.update(config)
        grpcClient.reconfigure(config)
    }
}
