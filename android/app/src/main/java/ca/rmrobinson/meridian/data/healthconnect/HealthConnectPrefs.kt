package ca.rmrobinson.meridian.data.healthconnect

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import java.time.Instant
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
    private val lastSyncKey = longPreferencesKey("hc_last_sync_epoch_ms")

    suspend fun getLastSync(): Instant? =
        dataStore.data.map { it[lastSyncKey] }.firstOrNull()?.let { Instant.ofEpochMilli(it) }

    suspend fun setLastSync(t: Instant) {
        dataStore.edit { it[lastSyncKey] = t.toEpochMilli() }
    }
}
