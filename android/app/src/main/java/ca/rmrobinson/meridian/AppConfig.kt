package ca.rmrobinson.meridian

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

enum class ThemeMode { SYSTEM, LIGHT, DARK }

data class AppConfig(
    val grpcHost: String,
    val grpcPort: Int,
    val bearerToken: String,
    val usePlaintext: Boolean = false,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
) {
    val isConfigured: Boolean
        get() = grpcHost.isNotBlank() && bearerToken.isNotBlank()

    companion object {
        val EMPTY = AppConfig(grpcHost = "", grpcPort = 443, bearerToken = "")

        fun fromPrefs(prefs: SharedPreferences) = AppConfig(
            grpcHost = prefs.getString("grpc_host", "") ?: "",
            grpcPort = prefs.getInt("grpc_port", 443),
            bearerToken = prefs.getString("bearer_token", "") ?: "",
            usePlaintext = prefs.getBoolean("use_plaintext", false),
            themeMode = ThemeMode.entries.getOrElse(
                prefs.getInt("theme_mode", 0)
            ) { ThemeMode.SYSTEM },
        )
    }

    fun saveToPrefs(prefs: SharedPreferences) {
        // commit() is synchronous: ensures the bearer token is persisted to disk before
        // control returns to the caller, preventing credential loss on an immediate process kill.
        prefs.edit()
            .putString("grpc_host", grpcHost)
            .putInt("grpc_port", grpcPort)
            .putString("bearer_token", bearerToken)
            .putBoolean("use_plaintext", usePlaintext)
            .putInt("theme_mode", themeMode.ordinal)
            .commit()
    }
}

/**
 * Single source of truth for the current app configuration. Exposes a [StateFlow]
 * so that any observer sees config changes immediately after a settings save,
 * avoiding the stale-singleton problem of a plain Hilt-provided [AppConfig].
 */
@Singleton
class AppConfigStore @Inject constructor(prefs: SharedPreferences) {
    private val _config = MutableStateFlow(AppConfig.fromPrefs(prefs))
    val configFlow: StateFlow<AppConfig> = _config.asStateFlow()
    val current: AppConfig get() = _config.value

    fun update(config: AppConfig) {
        _config.value = config
    }
}
