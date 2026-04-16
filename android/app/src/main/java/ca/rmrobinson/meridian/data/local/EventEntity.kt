package ca.rmrobinson.meridian.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

enum class SyncState { LOCAL_ONLY, SYNCED, PENDING_UPDATE }

@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "family_id") val familyId: String,
    @ColumnInfo(name = "line_key") val lineKey: String,
    val type: String,                          // "span" or "point"
    val title: String,
    @ColumnInfo(name = "start_date") val startDate: String?,
    @ColumnInfo(name = "end_date") val endDate: String?,
    val date: String?,
    @ColumnInfo(name = "location_label") val locationLabel: String?,
    @ColumnInfo(name = "location_lat") val locationLat: Double?,
    @ColumnInfo(name = "location_lng") val locationLng: Double?,
    val description: String?,
    @ColumnInfo(name = "external_url") val externalUrl: String?,
    @ColumnInfo(name = "hero_image_url") val heroImageUrl: String?,
    @ColumnInfo(name = "metadata_json") val metadataJson: String,
    @ColumnInfo(name = "sync_state") val syncState: SyncState,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)
