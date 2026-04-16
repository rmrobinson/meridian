package ca.rmrobinson.meridian.ui.setup

import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import ca.rmrobinson.meridian.AppConfig
import ca.rmrobinson.meridian.data.remote.GrpcClient
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class SetupViewModel @Inject constructor(
    private val prefs: SharedPreferences,
    private val grpcClient: GrpcClient,
) : ViewModel() {

    var grpcHost by mutableStateOf("")
        private set
    var grpcPort by mutableStateOf("443")
        private set
    var bearerToken by mutableStateOf("")
        private set

    fun updateHost(value: String) { grpcHost = value }
    fun updatePort(value: String) { grpcPort = value }
    fun updateToken(value: String) { bearerToken = value }

    fun save(onSuccess: () -> Unit) {
        val config = AppConfig(
            grpcHost = grpcHost.trim(),
            grpcPort = grpcPort.toIntOrNull() ?: 443,
            bearerToken = bearerToken.trim(),
        )
        config.saveToPrefs(prefs)
        grpcClient.reconfigure(config)
        onSuccess()
    }
}
