package ca.rmrobinson.meridian

import android.content.SharedPreferences

data class AppConfig(
    val grpcHost: String,
    val grpcPort: Int,
    val bearerToken: String,
) {
    val isConfigured: Boolean
        get() = grpcHost.isNotBlank() && bearerToken.isNotBlank()

    companion object {
        val EMPTY = AppConfig(grpcHost = "", grpcPort = 443, bearerToken = "")

        fun fromPrefs(prefs: SharedPreferences) = AppConfig(
            grpcHost = prefs.getString("grpc_host", "") ?: "",
            grpcPort = prefs.getInt("grpc_port", 443),
            bearerToken = prefs.getString("bearer_token", "") ?: "",
        )
    }

    fun saveToPrefs(prefs: SharedPreferences) {
        prefs.edit()
            .putString("grpc_host", grpcHost)
            .putInt("grpc_port", grpcPort)
            .putString("bearer_token", bearerToken)
            .apply()
    }
}
