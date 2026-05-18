package ca.rmrobinson.meridian.data.healthconnect

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Stores lightweight HC sync metadata in DataStore.
 * Skipped/imported activity IDs are tracked in the Room [ca.rmrobinson.meridian.data.local.HcEventLinkDao]
 * rather than here, so they benefit from indexed lookups and automatic pruning.
 */
@Singleton
class HealthConnectPrefs @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    companion object {
        const val DEFAULT_LOOKBACK_DAYS = 7L
        const val MAX_LOOKBACK_DAYS = 365L
    }

    private val lookbackWindowDaysKey = longPreferencesKey("hc_lookback_window_days")

    suspend fun getLookbackWindowDays(): Long =
        dataStore.data.map { it[lookbackWindowDaysKey] }.firstOrNull() ?: DEFAULT_LOOKBACK_DAYS

    suspend fun setLookbackWindowDays(days: Long) {
        dataStore.edit { it[lookbackWindowDaysKey] = days }
    }
}
