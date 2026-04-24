package ca.rmrobinson.meridian.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface HcEventLinkDao {

    @Query("SELECT * FROM hc_event_links WHERE hc_id = :hcId")
    suspend fun findByHcId(hcId: String): HcEventLinkEntity?

    @Upsert
    suspend fun upsert(link: HcEventLinkEntity)

    /**
     * Removes SKIPPED entries older than [beforeMs] to prevent unbounded growth.
     * IMPORTED and MERGED entries are kept permanently so dedup remains correct.
     */
    @Query("DELETE FROM hc_event_links WHERE status = 'SKIPPED' AND created_at < :beforeMs")
    suspend fun pruneOldSkipped(beforeMs: Long)
}
