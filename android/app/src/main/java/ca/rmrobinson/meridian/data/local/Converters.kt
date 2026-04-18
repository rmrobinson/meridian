package ca.rmrobinson.meridian.data.local

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromSyncState(value: SyncState): String = value.name

    @TypeConverter
    fun toSyncState(value: String): SyncState =
        SyncState.entries.firstOrNull { it.name == value } ?: SyncState.SYNCED
}
