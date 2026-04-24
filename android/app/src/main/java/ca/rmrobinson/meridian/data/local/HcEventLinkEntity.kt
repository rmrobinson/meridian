package ca.rmrobinson.meridian.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

enum class HcLinkStatus { IMPORTED, MERGED, SKIPPED }

/**
 * Maps a Health Connect exercise ID to a Meridian event, or records that it was skipped.
 *
 * Using a dedicated table instead of a LIKE query on metadata_json gives O(1) dedup lookups
 * via the primary key index, and avoids losing the association when a full server sync
 * overwrites the event row (which strips hc_id from the JSON since it is not in the proto).
 *
 * Skipped entries are pruned by [ca.rmrobinson.meridian.domain.usecase.HealthConnectSyncUseCase]
 * once they are older than the sync lookback window so the table does not grow without bound.
 */
@Entity(
    tableName = "hc_event_links",
    indices = [Index(value = ["event_id"])],
)
data class HcEventLinkEntity(
    @PrimaryKey @ColumnInfo(name = "hc_id") val hcId: String,
    @ColumnInfo(name = "event_id") val eventId: String?,   // null when status = SKIPPED
    val status: HcLinkStatus,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)
