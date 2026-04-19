package ca.rmrobinson.meridian.ui.settings

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import ca.rmrobinson.meridian.AppConfig
import ca.rmrobinson.meridian.AppConfigStore
import ca.rmrobinson.meridian.ThemeMode
import ca.rmrobinson.meridian.data.remote.GrpcClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

data class SettingsUiState(
    val grpcHost: String = "",
    val grpcPort: String = "443",
    val bearerToken: String = "",
    val usePlaintext: Boolean = false,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefs: SharedPreferences,
    private val store: AppConfigStore,
    private val grpcClient: GrpcClient,
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
