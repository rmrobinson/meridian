package ca.rmrobinson.meridian.data.local

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromSyncState(value: SyncState): String = value.name

    @TypeConverter
    fun toSyncState(value: String): SyncState =
        SyncState.entries.firstOrNull { it.name == value } ?: SyncState.SYNCED

    @TypeConverter
    fun fromHcLinkStatus(value: HcLinkStatus): String = value.name

    @TypeConverter
    fun toHcLinkStatus(value: String): HcLinkStatus =
        HcLinkStatus.entries.firstOrNull { it.name == value } ?: HcLinkStatus.IMPORTED
}
